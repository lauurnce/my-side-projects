import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { megabyte, storagePlan, submissionLimits, submissionUpload } from "../../src/lib/config";
import { buildPdf } from "../fixtures/deck-files";
import {
  addDeck,
  addPending,
  addQuiz,
  addUnfinishedDeck,
  addUpload,
  admin,
  anon,
  completeSubmission,
  createActor,
  createClass,
  createRouteWorld,
  docxType,
  enroll,
  enrolledStudent,
  gradeSubmission,
  handIn,
  minutesAgo,
  pdfType,
  readGradeLog,
  readPending,
  readPendingOf,
  readSubmission,
  readSubmissionOf,
  readUsage,
  recordView,
  refused,
  removeCreatedUsers,
  removeDecks,
  removeFromClass,
  removeSubmissionFiles,
  reserveSubmission,
  secondsFromNow,
  setActivity,
  setReservedAt,
  storeSubmissionFile,
  submissionFileExists,
  submissionPath,
  type Actor,
  type Client,
} from "./helpers";

type Classroom = Awaited<ReturnType<typeof createClass>>;

const largest = submissionUpload.maxBytes;
const fillerActivityCount = 40;
const hoursAgo = (hours: number) => minutesAgo(hours * 60);
const shifted = (iso: string, seconds: number) => new Date(Date.parse(iso) + seconds * 1000).toISOString();

let world: Awaited<ReturnType<typeof createRouteWorld>>;
let filler: Actor;
let fillerStudent: Actor;
let fillerClassroom: Classroom;
let fillerActivities: { id: string; class_id: string }[];
const storedPaths: string[] = [];

function upload(options: Parameters<typeof addUpload>[2] = {}) {
  return addUpload(world.classroom.id, world.teacher.id, options);
}

async function reserved(student: Actor, activityId: string, change: Parameters<typeof reserveSubmission>[2] = {}) {
  const { result, error } = await reserveSubmission(student.client, activityId, change);
  expect(error).toBeNull();
  expect(result).toEqual({ status: "reserved", upload_id: expect.any(String) });
  return (await readPending(result!.upload_id!))!;
}

async function store(path: string, bytes: Uint8Array) {
  await storeSubmissionFile(path, bytes);
  storedPaths.push(path);
}

async function usageNow() {
  const { usage, error } = await readUsage(world.teacher.client);
  if (error || !usage) throw new Error("storage_usage returned nothing for a teacher");
  return usage;
}

async function pendingBytes(): Promise<number> {
  const { data, error } = await admin.from("submission_uploads").select("declared_bytes");
  if (error) throw error;
  return data.reduce((total, row) => total + row.declared_bytes, 0);
}

async function freeNow(): Promise<number> {
  const usage = await usageNow();
  return usage.block_bytes - usage.total_bytes - usage.reserved_bytes - (await pendingBytes());
}

async function deckBudgetFree(): Promise<number> {
  const usage = await usageNow();
  return usage.budget_bytes - usage.used_bytes - usage.reserved_bytes;
}

async function leaveFree(bytes: number) {
  let toFill = (await freeNow()) - bytes;
  if (toFill < 0) throw new Error("storage is already fuller than this test needs");
  const rows = [];
  for (const activity of fillerActivities) {
    if (toFill === 0) break;
    const id = randomUUID();
    const declared = Math.min(toFill, largest);
    rows.push({
      id,
      activity_id: activity.id,
      student_id: fillerStudent.id,
      file_path: submissionPath(activity, fillerStudent.id, id),
      file_name: "filler.pdf",
      mime: pdfType,
      declared_bytes: declared,
    });
    toFill -= declared;
  }
  if (toFill > 0) throw new Error("the filler class cannot hold enough pending uploads");
  const { error } = await admin.from("submission_uploads").insert(rows);
  if (error) throw error;
  expect(await freeNow()).toBe(bytes);
}

async function emptyFiller() {
  const { error } = await admin.from("submission_uploads").delete().eq("student_id", fillerStudent.id);
  if (error) throw error;
  await removeDecks([fillerClassroom.id, world.classroom.id]);
}

beforeAll(async () => {
  [world, filler, fillerStudent] = await Promise.all([
    createRouteWorld(),
    createActor("filler-teacher", "teacher"),
    createActor("filler-student"),
  ]);
  fillerClassroom = await createClass(filler.id, "Storage filler");
  await enroll(fillerClassroom.id, fillerStudent.id);
  const { data, error } = await admin
    .from("activities")
    .insert(
      Array.from({ length: fillerActivityCount }, (_, index) => ({
        class_id: fillerClassroom.id,
        type: "upload",
        title: `Filler ${index + 1}`,
        points: 10,
        created_by: filler.id,
      })),
    )
    .select("id, class_id");
  if (error) throw error;
  fillerActivities = data;
});

afterEach(emptyFiller);

afterAll(async () => {
  await removeSubmissionFiles(storedPaths);
  await removeCreatedUsers();
});

describe("reserve_submission", () => {
  it("reserve_submission: an enrolled student reserves an upload row built from the ids", async () => {
    const essay = await upload();
    const pdf = await reserved(world.studentA, essay.id, { file_name: "Access review.pdf", declared_bytes: 4096 });
    expect(pdf).toMatchObject({
      activity_id: essay.id,
      student_id: world.studentA.id,
      file_path: `${world.classroom.id}/${essay.id}/${world.studentA.id}/${pdf.id}.pdf`,
      file_name: "Access review.pdf",
      mime: pdfType,
      declared_bytes: 4096,
    });
    expect(Math.abs(Date.now() - Date.parse(pdf.reserved_at))).toBeLessThan(60_000);
    const docx = await reserved(world.studentB, essay.id, { file_name: "review.docx", file_kind: "docx" });
    expect(docx).toMatchObject({
      file_path: `${world.classroom.id}/${essay.id}/${world.studentB.id}/${docx.id}.docx`,
      mime: docxType,
      declared_bytes: 2048,
    });
    expect(await readSubmissionOf(essay.id, world.studentA.id)).toBeNull();
  });

  it("reserve_submission: not_found for a draft, a quiz, another class, a removed student, a teacher and an unknown id", async () => {
    const essay = await upload();
    const draft = await upload({ published: false });
    const quiz = (await addQuiz(world.teacher, world.classroom.id, [{ kind: "tf", key: true }])).activity;
    const removed = await enrolledStudent(world.classroom.id, "removed");
    await removeFromClass(world.teacher, world.classroom.id, removed.id);
    const cases: [Client, string][] = [
      [world.studentA.client, draft.id],
      [world.studentA.client, quiz.id],
      [world.studentA.client, randomUUID()],
      [world.otherStudent.client, essay.id],
      [world.outsider.client, essay.id],
      [removed.client, essay.id],
      [world.teacher.client, essay.id],
      [world.otherTeacher.client, essay.id],
      [admin, essay.id],
    ];
    for (const [client, activityId] of cases) {
      const { result, error } = await reserveSubmission(client, activityId);
      expect(error).toBeNull();
      expect(result).toEqual({ status: "not_found" });
      const withBadInput = await reserveSubmission(client, activityId, { file_kind: "html", declared_bytes: 0 });
      expect(withBadInput.result).toEqual({ status: "not_found" });
    }
    for (const activityId of [essay.id, draft.id, quiz.id]) {
      const { count } = await admin.from("submission_uploads").select("id", { count: "exact", head: true }).eq("activity_id", activityId);
      expect(count).toBe(0);
    }
  });

  it("reserve_submission: anon cannot call it", async () => {
    const essay = await upload();
    const { result, error } = await reserveSubmission(anon, essay.id);
    expect(error?.code).toBe(refused);
    expect(result).toBeNull();
  });

  it("reserve_submission: bad_kind for html, PDF, a path trick and null", async () => {
    const essay = await upload();
    for (const file_kind of ["html", "PDF", "pdf/../../x", "../pdf", "pdf ", "doc", "pptx", "", null]) {
      const { result, error } = await reserveSubmission(world.studentA.client, essay.id, { file_kind });
      expect(error).toBeNull();
      expect(result).toEqual({ status: "bad_kind" });
    }
    expect(await readPendingOf(essay.id, world.studentA.id)).toEqual([]);
  });

  it("reserve_submission: too_large for 0, a negative number, 25 MB plus 1 byte and null", async () => {
    const essay = await upload();
    expect(largest).toBe(25 * megabyte);
    for (const declared_bytes of [0, -1, largest + 1, 10 * largest, null]) {
      const { result, error } = await reserveSubmission(world.studentA.client, essay.id, { declared_bytes });
      expect(error).toBeNull();
      expect(result).toEqual({ status: "too_large" });
    }
    expect(await readPendingOf(essay.id, world.studentA.id)).toEqual([]);
    expect((await reserved(world.studentA, essay.id, { declared_bytes: 1 })).declared_bytes).toBe(1);
    expect((await reserved(world.studentB, essay.id, { declared_bytes: largest })).declared_bytes).toBe(largest);
  });

  it("reserve_submission: the file name is cleaned", async () => {
    const essay = await upload();
    expect(submissionLimits.fileNameLength).toBe(120);
    const cases: [string | null, string, string][] = [
      ["../../etc/passwd.pdf", "pdf", "....etcpasswd.pdf"],
      ["folder\\sub/essay.pdf", "pdf", "foldersubessay.pdf"],
      ["essay\u202Efdp.exe\u200B.pdf", "pdf", "essayfdp.exe.pdf"],
      ["  line\nbreak\t.pdf  ", "pdf", "linebreak.pdf"],
      ["x".repeat(200), "pdf", "x".repeat(120)],
      ["///", "pdf", "file.pdf"],
      ["\u200B\u202E", "pdf", "file.pdf"],
      ["", "pdf", "file.pdf"],
      [null, "pdf", "file.pdf"],
    ];
    for (const [file_name, file_kind, cleaned] of cases) {
      expect((await reserved(world.studentA, essay.id, { file_name, file_kind })).file_name).toBe(cleaned);
    }
    expect((await reserved(world.studentB, essay.id, { file_name: "/", file_kind: "docx" })).file_name).toBe("file.docx");
  });

  it("reserve_submission: a second call inside 30 minutes returns the same upload and updates the declared size", async () => {
    const essay = await upload();
    expect(submissionLimits.uploadWindowMinutes).toBe(30);
    const first = await reserved(world.studentA, essay.id, { declared_bytes: 4096 });
    await setReservedAt(first.id, minutesAgo(29));
    const second = await reserved(world.studentA, essay.id, { file_name: "second.pdf", declared_bytes: 9000 });
    expect(second.id).toBe(first.id);
    expect(second.file_path).toBe(first.file_path);
    expect(second).toMatchObject({ declared_bytes: 9000, file_name: "second.pdf" });
    expect(Date.parse(second.reserved_at)).toBeLessThan(Date.now() - 28 * 60 * 1000);
    expect(await readPendingOf(essay.id, world.studentA.id)).toHaveLength(1);
  });

  it("reserve_submission: after 31 minutes it returns a new upload and the old row is gone", async () => {
    const essay = await upload();
    const first = await reserved(world.studentA, essay.id);
    await setReservedAt(first.id, minutesAgo(31));
    const second = await reserved(world.studentA, essay.id);
    expect(second.id).not.toBe(first.id);
    expect(second.file_path).not.toBe(first.file_path);
    expect(await readPending(first.id)).toBeNull();
    expect(await readPendingOf(essay.id, world.studentA.id)).toEqual([second]);
    expect(Math.abs(Date.now() - Date.parse(second.reserved_at))).toBeLessThan(60_000);
  });

  it("reserve_submission: another kind returns a new upload and the old row is gone", async () => {
    const essay = await upload();
    const first = await reserved(world.studentA, essay.id);
    const second = await reserved(world.studentA, essay.id, { file_kind: "docx" });
    expect(second.id).not.toBe(first.id);
    expect(second.file_path.endsWith(`${second.id}.docx`)).toBe(true);
    expect(await readPending(first.id)).toBeNull();
    expect(await readPendingOf(essay.id, world.studentA.id)).toEqual([second]);
  });

  it("reserve_submission: a new upload is issued when the object already exists at the pending path", async () => {
    const essay = await upload();
    const first = await reserved(world.studentA, essay.id);
    await store(first.file_path, buildPdf(1));
    const second = await reserved(world.studentA, essay.id);
    expect(second.id).not.toBe(first.id);
    expect(await readPending(first.id)).toBeNull();
    expect(await submissionFileExists(first.file_path)).toBe(true);
    expect(await submissionFileExists(second.file_path)).toBe(false);
  });

  it("reserve_submission: graded once the submission is graded", async () => {
    const essay = await upload();
    const row = await handIn(world.studentA, essay.id);
    expect((await reserved(world.studentA, essay.id)).student_id).toBe(world.studentA.id);
    await admin.from("submission_uploads").delete().eq("activity_id", essay.id);
    expect((await gradeSubmission(world.teacher.client, row.id, row.upload_id, 18)).result?.status).toBe("graded");
    const { result, error } = await reserveSubmission(world.studentA.client, essay.id);
    expect(error).toBeNull();
    expect(result).toEqual({ status: "graded" });
    expect(await readPendingOf(essay.id, world.studentA.id)).toEqual([]);
    expect((await reserveSubmission(world.studentB.client, essay.id)).result?.status).toBe("reserved");
  });
});

describe("storage block", () => {
  it("storage block: the block in SQL equals the block in the config", async () => {
    const usage = await usageNow();
    expect(usage.block_bytes).toBe(storagePlan.blockBytes);
    expect(usage.block_bytes).toBe(900 * megabyte);
  });

  it("reserve_submission: full when the declared size does not fit under the block", async () => {
    const essay = await upload();
    await leaveFree(1000);
    const tooBig = await reserveSubmission(world.studentA.client, essay.id, { declared_bytes: 1001 });
    expect(tooBig.error).toBeNull();
    expect(tooBig.result).toEqual({ status: "full", free_bytes: 1000 });
    expect(await readPendingOf(essay.id, world.studentA.id)).toEqual([]);

    const fits = await reserved(world.studentA, essay.id, { declared_bytes: 1000 });
    expect(await freeNow()).toBe(0);
    expect((await reserveSubmission(world.studentB.client, essay.id, { declared_bytes: 1 })).result).toEqual({
      status: "full",
      free_bytes: 0,
    });

    const again = await reserved(world.studentA, essay.id, { declared_bytes: 400 });
    expect(again.id).toBe(fits.id);
    expect(await freeNow()).toBe(600);
    const grown = await reserveSubmission(world.studentA.client, essay.id, { declared_bytes: 1001 });
    expect(grown.result).toEqual({ status: "full", free_bytes: 1000 });
    expect((await readPending(fits.id))!.declared_bytes).toBe(400);
  });

  it("reserve_submission: free_bytes is never negative when storage is over the block", async () => {
    const essay = await upload();
    await leaveFree(0);
    await addUnfinishedDeck(fillerClassroom.id, filler.id, { sizeBytes: 5000 });
    expect((await reserveSubmission(world.studentA.client, essay.id, { declared_bytes: 1 })).result).toEqual({
      status: "full",
      free_bytes: 0,
    });
  });

  it("reserve_submission: two calls at once that together do not fit give exactly one reserved", async () => {
    const essay = await upload();
    await leaveFree(1000);
    const results = await Promise.all([
      reserveSubmission(world.studentA.client, essay.id, { declared_bytes: 600 }),
      reserveSubmission(world.studentB.client, essay.id, { declared_bytes: 600 }),
    ]);
    expect(results.map(({ error }) => error)).toEqual([null, null]);
    expect(results.map(({ result }) => result?.status).sort()).toEqual(["full", "reserved"]);
    expect(results.find(({ result }) => result?.status === "full")?.result).toEqual({ status: "full", free_bytes: 400 });
    expect(await freeNow()).toBe(400);
  });

  it("reserve_submission: four calls at once by one student leave one upload row", async () => {
    const essay = await upload();
    const results = await Promise.all([1, 2, 3, 4].map(() => reserveSubmission(world.studentA.client, essay.id)));
    expect(results.map(({ error }) => error)).toEqual([null, null, null, null]);
    expect(new Set(results.map(({ result }) => result?.upload_id)).size).toBe(1);
    expect(await readPendingOf(essay.id, world.studentA.id)).toHaveLength(1);
  });

  it("reserve_deck: it stops at the total block when pending submissions fill it", async () => {
    await leaveFree(1000);
    expect(await deckBudgetFree()).toBeGreaterThan(megabyte);
    const reserveDeck = (declared_bytes: number) =>
      world.teacher.client.rpc("reserve_deck", {
        target_class: world.classroom.id,
        deck_title: "Week 1 slides",
        deck_kind: "pdf",
        target_lesson: null as never,
        declared_bytes,
      });
    expect((await reserveDeck(1001)).data).toEqual({ status: "full", free_bytes: 1000 });
    expect((await reserveDeck(1000)).data).toMatchObject({ status: "reserved" });
    const essay = await upload();
    expect((await reserveSubmission(world.studentA.client, essay.id, { declared_bytes: 1 })).result).toEqual({
      status: "full",
      free_bytes: 0,
    });
  });

  it("reserve_deck: the deck budget counts the decks bucket only", async () => {
    const essay = await upload();
    const bytes = buildPdf(1, 200_000);
    const before = await usageNow();
    const budgetFree = await deckBudgetFree();
    await store(submissionPath(essay, world.studentA.id, randomUUID()), bytes);
    await addPending(essay, world.studentB.id, { declaredBytes: 300_000 });
    const after = await usageNow();
    expect(after.used_bytes).toBe(before.used_bytes);
    expect(after.submission_bytes).toBe(before.submission_bytes + bytes.length);
    expect(await deckBudgetFree()).toBe(budgetFree);

    let toFill = budgetFree - 1000;
    while (toFill > 0) {
      const sizeBytes = Math.min(toFill, 100 * megabyte);
      await addUnfinishedDeck(fillerClassroom.id, filler.id, { sizeBytes });
      toFill -= sizeBytes;
    }
    expect(await deckBudgetFree()).toBe(1000);
    expect(await freeNow()).toBeGreaterThan(megabyte);
    const reserveDeck = (declared_bytes: number) =>
      world.teacher.client.rpc("reserve_deck", {
        target_class: world.classroom.id,
        deck_title: "Week 2 slides",
        deck_kind: "pdf",
        target_lesson: null as never,
        declared_bytes,
      });
    expect((await reserveDeck(1001)).data).toEqual({ status: "full", free_bytes: 1000 });
    expect((await reserveDeck(1000)).data).toMatchObject({ status: "reserved" });
  });
});

describe("complete_submission", () => {
  it("complete_submission: no API role can call it", async () => {
    const essay = await upload();
    const pending = await reserved(world.studentA, essay.id);
    for (const client of [world.studentA.client, world.studentB.client, world.teacher.client, world.otherTeacher.client, anon]) {
      const { result, error } = await completeSubmission(client, pending.id);
      expect(error?.code).toBe(refused);
      expect(result).toBeNull();
      const cancelled = await client.rpc("cancel_submission_upload", { target_upload: pending.id });
      expect(cancelled.error?.code).toBe(refused);
    }
    expect(await readPending(pending.id)).toEqual(pending);
    expect(await readSubmissionOf(essay.id, world.studentA.id)).toBeNull();
  });

  it("complete_submission: completed creates the row from the upload and removes the upload row", async () => {
    const essay = await upload();
    const pending = await reserved(world.studentA, essay.id, { file_name: "my/essay\u202E.pdf", declared_bytes: 4096 });
    const { result, error } = await completeSubmission(admin, pending.id, 3000, "etag-abc");
    expect(error).toBeNull();
    expect(result).toEqual({ status: "completed", submission_id: expect.any(String), activity_id: essay.id, old_path: null });
    expect(await readSubmission(result!.submission_id!)).toEqual({
      id: result!.submission_id,
      activity_id: essay.id,
      student_id: world.studentA.id,
      upload_id: pending.id,
      file_path: pending.file_path,
      file_name: "myessay.pdf",
      mime: pdfType,
      size_bytes: 3000,
      file_etag: "etag-abc",
      submitted_at: pending.reserved_at,
      is_late: false,
      score: null,
      feedback: null,
      graded_by: null,
      graded_at: null,
      files_removed_at: null,
    });
    expect(await readPending(pending.id)).toBeNull();
  });

  it("complete_submission: a real size equal to the declared one is accepted", async () => {
    const essay = await upload();
    const pending = await reserved(world.studentA, essay.id, { declared_bytes: 4096 });
    expect((await completeSubmission(admin, pending.id, 4096)).result?.status).toBe("completed");
    expect((await readSubmissionOf(essay.id, world.studentA.id))!.size_bytes).toBe(4096);
  });

  it("complete_submission: not_pending for an unknown or already completed upload and nothing changes", async () => {
    const essay = await upload();
    const pending = await reserved(world.studentA, essay.id);
    expect((await completeSubmission(admin, pending.id, 2000, "first")).result?.status).toBe("completed");
    const row = await readSubmissionOf(essay.id, world.studentA.id);
    const second = await completeSubmission(admin, pending.id, 1000, "second");
    expect(second.error).toBeNull();
    expect(second.result).toEqual({ status: "not_pending" });
    expect((await completeSubmission(admin, randomUUID())).result).toEqual({ status: "not_pending" });
    expect(await readSubmissionOf(essay.id, world.studentA.id)).toEqual(row);
  });

  it("complete_submission: too_large when the real size is above the declared one", async () => {
    const essay = await upload();
    for (const realBytes of [4097, largest + 1, 0, -1, null]) {
      const pending = await reserved(world.studentA, essay.id, { declared_bytes: 4096 });
      const { result, error } = await completeSubmission(admin, pending.id, realBytes);
      expect(error).toBeNull();
      expect(result).toEqual({ status: "too_large", file_path: pending.file_path });
      expect(await readPending(pending.id)).toBeNull();
      expect(await readSubmissionOf(essay.id, world.studentA.id)).toBeNull();
    }
  });

  it("complete_submission: an under-declared replacement leaves the first submission in place", async () => {
    const essay = await upload();
    const first = await handIn(world.studentA, essay.id);
    const pending = await reserved(world.studentA, essay.id, { declared_bytes: 100 });
    expect((await completeSubmission(admin, pending.id, 101)).result).toEqual({ status: "too_large", file_path: pending.file_path });
    expect(await readSubmission(first.id)).toEqual(first);
  });

  it("complete_submission: a replacement keeps the row id, takes the new upload and returns the old path", async () => {
    const essay = await upload();
    const first = await handIn(world.studentA, essay.id);
    const pending = await reserved(world.studentA, essay.id, { file_kind: "docx", file_name: "second.docx", declared_bytes: 5000 });
    const { result } = await completeSubmission(admin, pending.id, 4500, "etag-2");
    expect(result).toEqual({ status: "completed", submission_id: first.id, activity_id: essay.id, old_path: first.file_path });
    const row = (await readSubmission(first.id))!;
    expect(row).toMatchObject({
      id: first.id,
      upload_id: pending.id,
      file_path: pending.file_path,
      file_name: "second.docx",
      mime: docxType,
      size_bytes: 4500,
      file_etag: "etag-2",
      score: null,
    });
    expect(row.upload_id).not.toBe(first.upload_id);
    const { count } = await admin.from("submissions").select("id", { count: "exact", head: true }).eq("activity_id", essay.id);
    expect(count).toBe(1);
  });

  it("complete_submission: a reservation made before grading cannot complete after it", async () => {
    const essay = await upload();
    const first = await handIn(world.studentA, essay.id);
    const pending = await reserved(world.studentA, essay.id, { file_name: "swapped.pdf" });
    expect((await gradeSubmission(world.teacher.client, first.id, first.upload_id, 19)).result?.status).toBe("graded");
    const graded = await readSubmission(first.id);
    const { result, error } = await completeSubmission(admin, pending.id, 2048, "etag-swapped");
    expect(error).toBeNull();
    expect(result).toEqual({ status: "graded", file_path: pending.file_path });
    expect(await readSubmission(first.id)).toEqual(graded);
    expect(graded).toMatchObject({ score: 19, upload_id: first.upload_id, file_path: first.file_path, file_name: "essay.pdf" });
    expect(await readPending(pending.id)).toBeNull();
  });

  it("cancel_submission_upload: the service role removes the upload row", async () => {
    const essay = await upload();
    const pending = await reserved(world.studentA, essay.id);
    const { data, error } = await admin.rpc("cancel_submission_upload", { target_upload: pending.id });
    expect(error).toBeNull();
    expect(data).toBe("cancelled");
    expect(await readPending(pending.id)).toBeNull();
    expect((await completeSubmission(admin, pending.id)).result).toEqual({ status: "not_pending" });
  });
});

describe("late flag", () => {
  const dueAt = minutesAgo(10);

  async function completedAt(reservedAt: string, due: string | null = dueAt) {
    const essay = await upload({ dueAt: due });
    const pending = await reserved(world.studentA, essay.id);
    await setReservedAt(pending.id, reservedAt);
    const { result } = await completeSubmission(admin, pending.id);
    expect(result?.status).toBe("completed");
    return (await readSubmission(result!.submission_id!))!;
  }

  it("one second before the due time is on time", async () => {
    const reservedAt = shifted(dueAt, -1);
    const row = await completedAt(reservedAt);
    expect(row.is_late).toBe(false);
    expect(Date.parse(row.submitted_at)).toBe(Date.parse(reservedAt));
  });

  it("exactly at the due time is late", async () => {
    const row = await completedAt(dueAt);
    expect(row.is_late).toBe(true);
    expect(Date.parse(row.submitted_at)).toBe(Date.parse(dueAt));
  });

  it("one second after the due time is late", async () => {
    const reservedAt = shifted(dueAt, 1);
    const row = await completedAt(reservedAt);
    expect(row.is_late).toBe(true);
    expect(Date.parse(row.submitted_at)).toBe(Date.parse(reservedAt));
  });

  it("late flag: an upload reserved 29 minutes ago, before the due time, is on time", async () => {
    const reservedAt = minutesAgo(29);
    const row = await completedAt(reservedAt);
    expect(row.is_late).toBe(false);
    expect(Date.parse(row.submitted_at)).toBe(Date.parse(reservedAt));
  });

  it("late flag: an upload completed more than 30 minutes after it was reserved uses the completion time", async () => {
    const reservedAt = minutesAgo(31);
    const row = await completedAt(reservedAt);
    expect(row.is_late).toBe(true);
    expect(Math.abs(Date.now() - Date.parse(row.submitted_at))).toBeLessThan(60_000);
    const stillOpen = await completedAt(reservedAt, secondsFromNow(3600));
    expect(stillOpen.is_late).toBe(false);
  });

  it("late flag: with no due date nothing is late", async () => {
    for (const reservedAt of [minutesAgo(5), minutesAgo(600)]) {
      expect((await completedAt(reservedAt, null)).is_late).toBe(false);
    }
  });

  it("late flag: moving the due time later clears the flag and moving it earlier sets it, on every submission", async () => {
    const essay = await upload({ dueAt: null });
    const early = await reserved(world.studentA, essay.id);
    await setReservedAt(early.id, minutesAgo(20));
    const recent = await reserved(world.studentB, essay.id);
    await setReservedAt(recent.id, minutesAgo(5));
    const earlyRow = (await completeSubmission(admin, early.id)).result!.submission_id!;
    const recentRow = (await completeSubmission(admin, recent.id)).result!.submission_id!;
    const flags = async () => [(await readSubmission(earlyRow))!.is_late, (await readSubmission(recentRow))!.is_late];
    expect(await flags()).toEqual([false, false]);

    const asTeacher = await world.teacher.client.from("activities").update({ due_at: minutesAgo(10) }).eq("id", essay.id);
    expect(asTeacher.error).toBeNull();
    expect(await flags()).toEqual([false, true]);
    await setActivity(essay.id, { due_at: minutesAgo(30) });
    expect(await flags()).toEqual([true, true]);
    await setActivity(essay.id, { due_at: secondsFromNow(3600) });
    expect(await flags()).toEqual([false, false]);
    await setActivity(essay.id, { due_at: (await readSubmission(earlyRow))!.submitted_at });
    expect(await flags()).toEqual([true, true]);
    await setActivity(essay.id, { due_at: null });
    expect(await flags()).toEqual([false, false]);
  });
});

describe("grade_submission", () => {
  it("grade_submission: graded sets the score, the trimmed feedback, the grader and the time, and adds a log row", async () => {
    const essay = await upload({ points: 20 });
    const row = await handIn(world.studentA, essay.id, { file_name: "review.pdf", declared_bytes: 3000 });
    const { result, error } = await gradeSubmission(world.teacher.client, row.id, row.upload_id, 17, "  \n Clear tables.\nCheck the grants. \t\n");
    expect(error).toBeNull();
    expect(result).toEqual({ status: "graded", regrade: false });
    const graded = (await readSubmission(row.id))!;
    expect(graded).toEqual({
      ...row,
      score: 17,
      feedback: "Clear tables.\nCheck the grants.",
      graded_by: world.teacher.id,
      graded_at: expect.any(String),
    });
    expect(Math.abs(Date.now() - Date.parse(graded.graded_at!))).toBeLessThan(60_000);
    expect(await readGradeLog(row.id)).toEqual([
      {
        id: expect.any(String),
        submission_id: row.id,
        activity_id: essay.id,
        student_id: world.studentA.id,
        old_score: null,
        new_score: 17,
        feedback: "Clear tables.\nCheck the grants.",
        file_path: row.file_path,
        file_name: "review.pdf",
        size_bytes: 3000,
        file_etag: "etag-1",
        graded_by: world.teacher.id,
        graded_at: expect.any(String),
      },
    ]);
  });

  it("grade_submission: a second call is a regrade and logs the old score", async () => {
    const essay = await upload({ points: 20 });
    const row = await handIn(world.studentA, essay.id);
    expect((await gradeSubmission(world.teacher.client, row.id, row.upload_id, 12)).result).toEqual({ status: "graded", regrade: false });
    const second = await gradeSubmission(world.teacher.client, row.id, row.upload_id, 20, "Regraded after a recheck.");
    expect(second.result).toEqual({ status: "graded", regrade: true });
    expect(await readSubmission(row.id)).toMatchObject({ score: 20, feedback: "Regraded after a recheck." });
    const log = await readGradeLog(row.id);
    expect(log.map((entry) => [entry.old_score, entry.new_score])).toEqual([[null, 12], [12, 20]]);
    expect(log[1].feedback).toBe("Regraded after a recheck.");
  });

  it("grade_submission: changed when the expected upload is not the current one, and nothing is graded", async () => {
    const essay = await upload({ points: 20 });
    const first = await handIn(world.studentA, essay.id);
    const replaced = await handIn(world.studentA, essay.id, { file_name: "second.pdf" });
    expect(replaced.id).toBe(first.id);
    for (const expected of [first.upload_id, randomUUID()]) {
      const { result, error } = await gradeSubmission(world.teacher.client, first.id, expected, 20);
      expect(error).toBeNull();
      expect(result).toEqual({ status: "changed" });
    }
    const missing = await world.teacher.client.rpc("grade_submission", {
      target_submission: first.id,
      expected_upload: null as never,
      new_score: 20,
      new_feedback: "Clear.",
    });
    expect(missing.data).toEqual({ status: "changed" });
    expect(await readSubmission(first.id)).toEqual(replaced);
    expect(await readGradeLog(first.id)).toEqual([]);
    expect((await gradeSubmission(world.teacher.client, first.id, replaced.upload_id, 20)).result?.status).toBe("graded");
  });

  it("grade_submission: bad_score for null, -1 and points plus 1, and a decimal is refused by the API", async () => {
    const essay = await upload({ points: 20 });
    const row = await handIn(world.studentA, essay.id);
    for (const score of [null, -1, 21, 1000]) {
      const { result, error } = await gradeSubmission(world.teacher.client, row.id, row.upload_id, score);
      expect(error).toBeNull();
      expect(result).toEqual({ status: "bad_score", points: 20 });
    }
    const decimal = await gradeSubmission(world.teacher.client, row.id, row.upload_id, 7.5);
    expect(decimal.error).not.toBeNull();
    expect(decimal.result).toBeNull();
    expect(await readSubmission(row.id)).toEqual(row);
    expect(await readGradeLog(row.id)).toEqual([]);
    for (const score of [0, 20]) {
      expect((await gradeSubmission(world.teacher.client, row.id, row.upload_id, score)).result?.status).toBe("graded");
      expect((await readSubmission(row.id))!.score).toBe(score);
    }
  });

  it("grade_submission: bad_feedback for 5,001 characters and a hidden control character", async () => {
    const essay = await upload({ points: 20 });
    const row = await handIn(world.studentA, essay.id);
    expect(submissionLimits.feedbackLength).toBe(5000);
    for (const feedback of ["x".repeat(5001), "Good\u0007work", "Good\u202Ekrow", "Good\u0001work"]) {
      const { result, error } = await gradeSubmission(world.teacher.client, row.id, row.upload_id, 10, feedback);
      expect(error).toBeNull();
      expect(result).toEqual({ status: "bad_feedback" });
    }
    expect(await readSubmission(row.id)).toEqual(row);
    expect(await readGradeLog(row.id)).toEqual([]);
    const longest = `  ${"x".repeat(5000)}  `;
    expect((await gradeSubmission(world.teacher.client, row.id, row.upload_id, 10, longest)).result?.status).toBe("graded");
    expect((await readSubmission(row.id))!.feedback).toBe("x".repeat(5000));
    expect((await gradeSubmission(world.teacher.client, row.id, row.upload_id, 10, null)).result?.status).toBe("graded");
    expect((await readSubmission(row.id))!.feedback).toBe("");
  });

  it("grade_submission: refused with the same answer for a student, another teacher and an unknown id", async () => {
    const essay = await upload({ points: 20 });
    const row = await handIn(world.studentA, essay.id);
    const cases: [Client, string][] = [
      [world.studentA.client, row.id],
      [world.studentB.client, row.id],
      [world.otherTeacher.client, row.id],
      [world.otherStudent.client, row.id],
      [admin, row.id],
      [world.teacher.client, randomUUID()],
      [world.otherTeacher.client, randomUUID()],
    ];
    for (const [client, submissionId] of cases) {
      for (const [expected, score] of [[row.upload_id, 20], [randomUUID(), 20], [row.upload_id, 999]] as const) {
        const { result, error } = await gradeSubmission(client, submissionId, expected, score);
        expect(error).toBeNull();
        expect(result).toEqual({ status: "refused" });
      }
    }
    expect(await readSubmission(row.id)).toEqual(row);
    expect(await readGradeLog(row.id)).toEqual([]);
  });

  it("grade_submission: anon cannot call it", async () => {
    const essay = await upload();
    const row = await handIn(world.studentA, essay.id);
    const { result, error } = await gradeSubmission(anon, row.id, row.upload_id, 20);
    expect(error?.code).toBe(refused);
    expect(result).toBeNull();
    expect(await readSubmission(row.id)).toEqual(row);
  });
});

describe("drop_graded_files", () => {
  it("drop_graded_files: it clears the path of graded rows only and returns the count", async () => {
    const essay = await upload({ points: 20 });
    const graded = await handIn(world.studentA, essay.id);
    const ungraded = await handIn(world.studentB, essay.id);
    expect((await gradeSubmission(world.teacher.client, graded.id, graded.upload_id, 16)).result?.status).toBe("graded");
    const beforeDrop = (await readSubmission(graded.id))!;

    for (const client of [world.studentA.client, world.studentB.client, world.otherTeacher.client, admin]) {
      const { data, error } = await client.rpc("drop_graded_files", { target_activity: essay.id });
      expect(error).toBeNull();
      expect(data).toBe(0);
    }
    expect(await readSubmission(graded.id)).toEqual(beforeDrop);
    expect((await anon.rpc("drop_graded_files", { target_activity: essay.id })).error?.code).toBe(refused);
    expect((await world.teacher.client.rpc("drop_graded_files", { target_activity: randomUUID() })).data).toBe(0);

    const dropped = await world.teacher.client.rpc("drop_graded_files", { target_activity: essay.id });
    expect(dropped.error).toBeNull();
    expect(dropped.data).toBe(1);
    const afterDrop = (await readSubmission(graded.id))!;
    expect(afterDrop).toEqual({ ...beforeDrop, file_path: null, files_removed_at: expect.any(String) });
    expect(Math.abs(Date.now() - Date.parse(afterDrop.files_removed_at!))).toBeLessThan(60_000);
    expect(await readSubmission(ungraded.id)).toEqual(ungraded);
    expect((await world.teacher.client.rpc("drop_graded_files", { target_activity: essay.id })).data).toBe(0);
    expect(await readSubmission(graded.id)).toEqual(afterDrop);
    expect((await readGradeLog(graded.id))[0].file_path).toBe(graded.file_path);
  });

  it("drop_graded_files: the teacher still sees the row and a regrade works with no file", async () => {
    const essay = await upload({ points: 20 });
    const row = await handIn(world.studentA, essay.id);
    await gradeSubmission(world.teacher.client, row.id, row.upload_id, 10);
    expect((await world.teacher.client.rpc("drop_graded_files", { target_activity: essay.id })).data).toBe(1);
    const again = await gradeSubmission(world.teacher.client, row.id, row.upload_id, 11);
    expect(again.result).toEqual({ status: "graded", regrade: true });
    expect(await readSubmission(row.id)).toMatchObject({ score: 11, file_path: null });
    expect((await readGradeLog(row.id))[1]).toMatchObject({ old_score: 10, new_score: 11, file_path: null });
  });
});

describe("sweep_submissions", () => {
  async function sweep() {
    const { data, error } = await admin.rpc("sweep_submissions");
    expect(error).toBeNull();
    return data as string[];
  }

  it("sweep_submissions: no API role can call it", async () => {
    for (const client of [world.teacher.client, world.studentA.client, world.otherTeacher.client, anon]) {
      const { data, error } = await client.rpc("sweep_submissions");
      expect(error?.code).toBe(refused);
      expect(data).toBeNull();
    }
  });

  it("sweep_submissions: a fresh object that matches no row is not returned", async () => {
    const essay = await upload();
    const orphan = submissionPath(essay, world.studentA.id, randomUUID());
    await store(orphan, buildPdf(1));
    expect(await sweep()).not.toContain(orphan);
    expect(await submissionFileExists(orphan)).toBe(true);
  });

  it("sweep_submissions: a fresh object dropped by drop_graded_files and the files under rows are not returned", async () => {
    const essay = await upload({ points: 20 });
    const graded = await handIn(world.studentA, essay.id);
    const kept = await handIn(world.studentB, essay.id);
    const pending = await reserved(await enrolledStudent(world.classroom.id, "uploading"), essay.id);
    for (const path of [graded.file_path!, kept.file_path!, pending.file_path]) await store(path, buildPdf(1));
    await gradeSubmission(world.teacher.client, graded.id, graded.upload_id, 16);
    expect((await world.teacher.client.rpc("drop_graded_files", { target_activity: essay.id })).data).toBe(1);
    const swept = await sweep();
    expect(swept).not.toContain(graded.file_path);
    expect(swept).not.toContain(kept.file_path);
    expect(swept).not.toContain(pending.file_path);
  });

  it("sweep_submissions: an upload row older than 6 hours is deleted and a newer one is kept", async () => {
    const essay = await upload();
    const stale = await addPending(essay, world.studentA.id, { reservedAt: hoursAgo(6.1) });
    const recent = await addPending(essay, world.studentB.id, { reservedAt: hoursAgo(5.9) });
    await sweep();
    expect(await readPending(stale.id)).toBeNull();
    expect(await readPending(recent.id)).toEqual(recent);
  });
});

describe("storage_usage", () => {
  it("storage_usage: it has the six keys and a student gets nothing", async () => {
    const usage = await usageNow();
    expect(Object.keys(usage).sort()).toEqual(
      ["block_bytes", "budget_bytes", "reserved_bytes", "submission_bytes", "total_bytes", "used_bytes"].sort(),
    );
    expect((await readUsage(world.studentA.client)).usage).toBeNull();
    expect((await readUsage(anon)).error?.code).toBe(refused);
  });

  it("storage_usage: submission_bytes grows by a stored submission and used_bytes does not", async () => {
    const essay = await upload();
    const bytes = buildPdf(1, 30_000);
    const before = await usageNow();
    await store(submissionPath(essay, world.studentA.id, randomUUID()), bytes);
    const after = await usageNow();
    expect(after.submission_bytes).toBe(before.submission_bytes + bytes.length);
    expect(after.total_bytes).toBe(before.total_bytes + bytes.length);
    expect(after.used_bytes).toBe(before.used_bytes);
    expect(after.total_bytes).toBe(after.used_bytes + after.submission_bytes);
  });
});

describe("deck_view_counts", () => {
  it("deck_view_counts: it counts the caller's own views per deck", async () => {
    const first = await addDeck(world.classroom.id, world.teacher.id, { slideCount: 5 });
    const second = await addDeck(world.classroom.id, world.teacher.id, { slideCount: 5 });
    for (const slideNo of [1, 2, 3]) await recordView(first.id, world.studentA.id, slideNo);
    await recordView(second.id, world.studentA.id, 4);
    for (const slideNo of [1, 2]) await recordView(first.id, world.studentB.id, slideNo);

    const counts = async (client: Client) => {
      const { data, error } = await client.rpc("deck_view_counts");
      expect(error).toBeNull();
      return [...data!].sort((left, right) => right.viewed - left.viewed);
    };
    expect(await counts(world.studentA.client)).toEqual([
      { deck_id: first.id, viewed: 3 },
      { deck_id: second.id, viewed: 1 },
    ]);
    expect(await counts(world.studentB.client)).toEqual([{ deck_id: first.id, viewed: 2 }]);
    expect(await counts(world.teacher.client)).toEqual([]);
    expect(await counts(world.otherStudent.client)).toEqual([]);
  });

  it("deck_view_counts: anon cannot call it", async () => {
    const { data, error } = await anon.rpc("deck_view_counts");
    expect(error?.code).toBe(refused);
    expect(data).toBeNull();
  });
});
