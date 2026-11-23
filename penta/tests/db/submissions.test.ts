import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { megabyte, submissionLimits, submissionUpload } from "../../src/lib/config";
import {
  activityColumns,
  addPending,
  addQuiz,
  addSubmission,
  addUpload,
  admin,
  anon,
  checkFailed,
  completeSubmission,
  createRouteWorld,
  docxType,
  duplicateKey,
  enrolledStudent,
  foreignKeyFailed,
  gradeLogColumns,
  gradeSubmission,
  handIn,
  pdfType,
  quizRow,
  readActivity,
  readGradeLog,
  readPending,
  readSubmission,
  refused,
  removeCreatedUsers,
  removeFromClass,
  saveQuestion,
  setActivity,
  submissionColumns,
  submissionPath,
  testEmail,
  testPassword,
  type Actor,
  type Client,
} from "./helpers";

type Activity = NonNullable<Awaited<ReturnType<typeof readActivity>>>;
type Submission = NonNullable<Awaited<ReturnType<typeof readSubmission>>>;

const guardedColumns: Record<string, unknown> = {
  score: 20,
  feedback: "Full marks.",
  is_late: false,
  submitted_at: "2026-01-01T00:00:00Z",
  graded_by: randomUUID(),
  graded_at: "2026-01-01T00:00:00Z",
  file_path: null,
  file_name: "swapped.pdf",
  upload_id: randomUUID(),
};

let world: Awaited<ReturnType<typeof createRouteWorld>>;
let essay: Activity;
let rowA: Submission;
let rowB: Submission;
let apiCallers: [string, Client][];

function upload(options: Parameters<typeof addUpload>[2] = {}) {
  return addUpload(world.classroom.id, world.teacher.id, options);
}

async function visible(actor: Actor, activityId = essay.id) {
  const { data, error } = await actor.client.from("submissions").select("id").eq("activity_id", activityId);
  expect(error).toBeNull();
  return data!.map((row) => row.id).sort();
}

function validRow(activity: Activity, studentId: string, change: Record<string, unknown> = {}) {
  const uploadId = randomUUID();
  return {
    activity_id: activity.id,
    student_id: studentId,
    upload_id: uploadId,
    file_path: submissionPath(activity, studentId, uploadId),
    file_name: "essay.pdf",
    mime: pdfType,
    size_bytes: 1024,
    submitted_at: new Date().toISOString(),
    ...change,
  };
}

async function insertCode(activity: Activity, studentId: string, change: Record<string, unknown>) {
  const { error } = await admin.from("submissions").insert(validRow(activity, studentId, change) as never);
  return error?.code;
}

beforeAll(async () => {
  world = await createRouteWorld();
  essay = await upload({ title: "Access review essay" });
  rowA = await handIn(world.studentA, essay.id);
  rowB = await handIn(world.studentB, essay.id, { file_kind: "docx", file_name: "essay.docx" });
  apiCallers = [
    ["the owner", world.studentA.client],
    ["a classmate", world.studentB.client],
    ["the class teacher", world.teacher.client],
    ["another teacher", world.otherTeacher.client],
    ["anon", anon],
  ];
});

afterAll(removeCreatedUsers);

describe("submissions select", () => {
  it("submissions select: a student sees the own row with every column", async () => {
    const { data, error } = await world.studentA.client.from("submissions").select(submissionColumns).eq("activity_id", essay.id);
    expect(error).toBeNull();
    expect(data).toEqual([rowA]);
    expect(rowA).toMatchObject({ student_id: world.studentA.id, mime: pdfType, score: null, graded_at: null, is_late: false });
    expect(rowB.mime).toBe(docxType);
  });

  it("a student cannot read another student's submission row", async () => {
    expect(await visible(world.studentB)).toEqual([rowB.id]);
    const byId = await world.studentB.client.from("submissions").select(submissionColumns).eq("id", rowA.id);
    expect(byId.error).toBeNull();
    expect(byId.data).toEqual([]);
    const byStudent = await world.studentB.client.from("submissions").select("id").eq("student_id", world.studentA.id);
    expect(byStudent.data).toEqual([]);
    const byPath = await world.studentB.client.from("submissions").select("id").eq("file_path", rowA.file_path!);
    expect(byPath.data).toEqual([]);
  });

  it("submissions select: a student of another class, another teacher and the outsider see nothing, also by id", async () => {
    for (const actor of [world.otherStudent, world.otherTeacher, world.outsider]) {
      expect(await visible(actor)).toEqual([]);
      const byId = await actor.client.from("submissions").select(submissionColumns).eq("id", rowA.id);
      expect(byId.error).toBeNull();
      expect(byId.data).toEqual([]);
      expect((await actor.client.from("submissions").select("id")).data).toEqual([]);
    }
  });

  it("submissions select: anon is refused, also by id", async () => {
    for (const read of [anon.from("submissions").select("id"), anon.from("submissions").select("id").eq("id", rowA.id)]) {
      const { data, error } = await read;
      expect(error?.code).toBe(refused);
      expect(data).toBeNull();
    }
  });

  it("submissions select: the class teacher sees every row of the activity", async () => {
    expect(await visible(world.teacher)).toEqual([rowA.id, rowB.id].sort());
  });

  it("submissions select: a removed student sees nothing", async () => {
    const student = await enrolledStudent(world.classroom.id, "removed");
    const row = await handIn(student, essay.id);
    expect(await visible(student)).toEqual([row.id]);
    await removeFromClass(world.teacher, world.classroom.id, student.id);
    expect(await visible(student)).toEqual([]);
    const byId = await student.client.from("submissions").select("id").eq("id", row.id);
    expect(byId.data).toEqual([]);
    expect(await visible(world.teacher)).toContain(row.id);
  });

  it("submissions select: a row of an unpublished activity is hidden from the student and shown to the teacher", async () => {
    const draft = await upload({ published: false });
    const row = await addSubmission(draft, world.studentA.id);
    expect(await visible(world.studentA, draft.id)).toEqual([]);
    expect((await world.studentA.client.from("submissions").select("id").eq("id", row.id)).data).toEqual([]);
    expect(await visible(world.teacher, draft.id)).toEqual([row.id]);
    await setActivity(draft.id, { published_at: new Date().toISOString() });
    expect(await visible(world.studentA, draft.id)).toEqual([row.id]);
  });
});

describe("submissions writes", () => {
  it("submissions writes: no API role can insert a row", async () => {
    const target = await upload();
    for (const [, client] of apiCallers) {
      const { data, error } = await client
        .from("submissions")
        .insert(validRow(target, world.studentA.id) as never)
        .select("id");
      expect(error?.code).toBe(refused);
      expect(data).toBeNull();
    }
    const { count } = await admin.from("submissions").select("id", { count: "exact", head: true }).eq("activity_id", target.id);
    expect(count).toBe(0);
  });

  it("submissions writes: no API role can update any column", async () => {
    for (const [, client] of apiCallers) {
      for (const [column, value] of Object.entries(guardedColumns)) {
        const { data, error } = await client
          .from("submissions")
          .update({ [column]: value } as never)
          .eq("id", rowA.id)
          .select("id");
        expect(error?.code).toBe(refused);
        expect(data).toBeNull();
      }
    }
    expect(await readSubmission(rowA.id)).toEqual(rowA);
  });

  it("submissions writes: no API role can upsert or delete a row", async () => {
    for (const [, client] of apiCallers) {
      const upserted = await client
        .from("submissions")
        .upsert({ ...rowA, file_name: "swapped.pdf" } as never, { onConflict: "id" })
        .select("id");
      expect(upserted.error?.code).toBe(refused);
      const byPair = await client
        .from("submissions")
        .upsert({ ...rowA, file_name: "swapped.pdf" } as never, { onConflict: "activity_id,student_id" });
      expect(byPair.error?.code).toBe(refused);
      const removed = await client.from("submissions").delete().eq("id", rowA.id).select("id");
      expect(removed.error?.code).toBe(refused);
      expect(removed.data).toBeNull();
    }
    expect(await readSubmission(rowA.id)).toEqual(rowA);
  });

  it("a student cannot set a score", async () => {
    for (const student of [world.studentA, world.studentB]) {
      const direct = await student.client.from("submissions").update({ score: 20 } as never).eq("id", rowA.id);
      expect(direct.error?.code).toBe(refused);
      const graded = { score: 20, graded_by: student.id, graded_at: new Date().toISOString() };
      const together = await student.client.from("submissions").update(graded as never).eq("id", rowA.id);
      expect(together.error?.code).toBe(refused);
      const upserted = await student.client.from("submissions").upsert({ ...rowA, ...graded } as never, { onConflict: "id" });
      expect(upserted.error?.code).toBe(refused);
      const byFunction = await gradeSubmission(student.client, rowA.id, rowA.upload_id, 20);
      expect(byFunction.error).toBeNull();
      expect(byFunction.result).toEqual({ status: "refused" });
      const pending = await addPending(essay, student.id);
      const completed = await completeSubmission(student.client, pending.id);
      expect(completed.error?.code).toBe(refused);
      expect(await readPending(pending.id)).toEqual(pending);
      await admin.from("submission_uploads").delete().eq("id", pending.id);
    }
    expect(await readSubmission(rowA.id)).toEqual(rowA);
    expect(await readGradeLog(rowA.id)).toEqual([]);
  });
});

describe("submission_uploads grants", () => {
  it("submission_uploads: a student, a teacher and anon cannot select, insert, update or delete", async () => {
    const target = await upload();
    const pending = await addPending(target, world.studentA.id);
    for (const client of [world.studentA.client, world.teacher.client, anon]) {
      const table = () => client.from("submission_uploads");
      expect((await table().select("id")).error?.code).toBe(refused);
      expect((await table().select("id").eq("id", pending.id)).error?.code).toBe(refused);
      const id = randomUUID();
      const row = { ...pending, id, student_id: world.studentB.id, file_path: submissionPath(target, world.studentB.id, id) };
      expect((await table().insert(row)).error?.code).toBe(refused);
      expect((await table().update({ declared_bytes: 1 }).eq("id", pending.id)).error?.code).toBe(refused);
      expect((await table().update({ reserved_at: new Date().toISOString() }).eq("id", pending.id)).error?.code).toBe(refused);
      expect((await table().delete().eq("id", pending.id)).error?.code).toBe(refused);
    }
    expect(await readPending(pending.id)).toEqual(pending);
  });

  it("submission_uploads: the path must be built from the row's own ids", async () => {
    const target = await upload();
    const id = randomUUID();
    const base = {
      id,
      activity_id: target.id,
      student_id: world.studentA.id,
      file_path: submissionPath(target, world.studentA.id, id),
      file_name: "essay.pdf",
      mime: pdfType,
      declared_bytes: 2048,
    };
    const badRows = [
      { ...base, file_path: submissionPath(target, world.studentB.id, id) },
      { ...base, file_path: submissionPath(target, world.studentA.id, randomUUID()) },
      { ...base, file_path: submissionPath(essay, world.studentA.id, id) },
      { ...base, file_path: `${base.file_path}.html` },
      { ...base, declared_bytes: 0 },
      { ...base, declared_bytes: submissionUpload.maxBytes + 1 },
    ];
    for (const row of badRows) {
      expect((await admin.from("submission_uploads").insert(row)).error?.code).toBe(checkFailed);
    }
    expect((await admin.from("submission_uploads").insert(base)).error).toBeNull();
    const second = randomUUID();
    const again = { ...base, id: second, file_path: submissionPath(target, world.studentA.id, second) };
    expect((await admin.from("submission_uploads").insert(again)).error?.code).toBe(duplicateKey);
  });
});

describe("submission_grade_log", () => {
  let graded: Submission;
  let logTarget: Activity;

  beforeAll(async () => {
    logTarget = await upload({ points: 20 });
    graded = await handIn(world.studentA, logTarget.id);
    const { result } = await gradeSubmission(world.teacher.client, graded.id, graded.upload_id, 15, "Good start.");
    expect(result).toEqual({ status: "graded", regrade: false });
  });

  it("submission_grade_log: the class teacher selects the rows", async () => {
    const { data, error } = await world.teacher.client
      .from("submission_grade_log")
      .select(gradeLogColumns)
      .eq("submission_id", graded.id);
    expect(error).toBeNull();
    expect(data).toEqual(await readGradeLog(graded.id));
    expect(data).toHaveLength(1);
    expect(data![0]).toMatchObject({ student_id: world.studentA.id, old_score: null, new_score: 15, graded_by: world.teacher.id });
  });

  it("submission_grade_log: a student, another teacher and anon get nothing", async () => {
    for (const actor of [world.studentA, world.studentB, world.otherTeacher, world.otherStudent]) {
      const { data, error } = await actor.client.from("submission_grade_log").select("id");
      expect(error).toBeNull();
      expect(data).toEqual([]);
      const byId = await actor.client.from("submission_grade_log").select("id").eq("submission_id", graded.id);
      expect(byId.data).toEqual([]);
    }
    const asAnon = await anon.from("submission_grade_log").select("id");
    expect(asAnon.error?.code).toBe(refused);
    expect(asAnon.data).toBeNull();
  });

  it("submission_grade_log: nobody can insert, update or delete", async () => {
    const before = await readGradeLog(graded.id);
    const forged = { ...before[0], id: randomUUID(), new_score: 20 };
    for (const [, client] of apiCallers) {
      const table = () => client.from("submission_grade_log");
      expect((await table().insert(forged)).error?.code).toBe(refused);
      expect((await table().update({ new_score: 20 }).eq("submission_id", graded.id)).error?.code).toBe(refused);
      expect((await table().update({ feedback: "Rewritten." }).eq("submission_id", graded.id)).error?.code).toBe(refused);
      expect((await table().delete().eq("submission_id", graded.id)).error?.code).toBe(refused);
    }
    expect(await readGradeLog(graded.id)).toEqual(before);
  });

  it("submission_grade_log: deleting the student account leaves the log rows", async () => {
    const created = await admin.auth.admin.createUser({ email: testEmail("leaver"), password: testPassword, email_confirm: true });
    expect(created.error).toBeNull();
    const leaverId = created.data.user!.id;
    await admin.from("enrollments").insert({ class_id: world.classroom.id, student_id: leaverId });
    const row = await addSubmission(logTarget, leaverId);
    expect((await gradeSubmission(world.teacher.client, row.id, row.upload_id, 12)).result?.status).toBe("graded");
    expect((await gradeSubmission(world.teacher.client, row.id, row.upload_id, 14)).result?.status).toBe("graded");
    const before = await readGradeLog(row.id);
    expect(before.map((entry) => [entry.old_score, entry.new_score])).toEqual([[null, 12], [12, 14]]);

    expect((await admin.auth.admin.deleteUser(leaverId)).error).toBeNull();
    expect(await readSubmission(row.id)).toBeNull();
    expect(await readGradeLog(row.id)).toEqual(before);
    const asTeacher = await world.teacher.client.from("submission_grade_log").select("id").eq("student_id", leaverId);
    expect(asTeacher.data).toHaveLength(2);
  });

  it("submission_grade_log: deleting the submission leaves the log rows", async () => {
    const target = await upload();
    const row = await handIn(world.studentB, target.id);
    expect((await gradeSubmission(world.teacher.client, row.id, row.upload_id, 9)).result?.status).toBe("graded");
    const before = await readGradeLog(row.id);
    expect(before).toHaveLength(1);
    expect((await admin.from("submissions").delete().eq("id", row.id)).error).toBeNull();
    expect(await readSubmission(row.id)).toBeNull();
    expect(await readGradeLog(row.id)).toEqual(before);
  });
});

describe("submissions constraints", () => {
  let target: Activity;

  beforeAll(async () => {
    target = await upload();
  });

  it("submissions constraints: a path whose third part is another student's id is refused", async () => {
    const uploadId = randomUUID();
    const change = { upload_id: uploadId, file_path: submissionPath(target, world.studentB.id, uploadId) };
    expect(await insertCode(target, world.studentA.id, change)).toBe(checkFailed);
    const otherActivity = { upload_id: uploadId, file_path: submissionPath(essay, world.outsider.id, uploadId) };
    expect(await insertCode(target, world.outsider.id, otherActivity)).toBe(checkFailed);
  });

  it("submissions constraints: a path with a wrong shape or extension is refused", async () => {
    const good = submissionPath(target, world.outsider.id, randomUUID());
    const paths = [
      "essay.pdf",
      `${target.id}/${world.outsider.id}/${randomUUID()}.pdf`,
      good.replace(".pdf", ".html"),
      good.replace(".pdf", ".PDF"),
      good.replace(".pdf", ""),
      `${good}/extra.pdf`,
      `../${good}`,
      good.replace(".pdf", ".pdf.exe"),
    ];
    for (const file_path of paths) expect(await insertCode(target, world.outsider.id, { file_path })).toBe(checkFailed);
  });

  it("submissions constraints: a second row for the same student and activity is refused", async () => {
    expect(await insertCode(essay, world.studentA.id, {})).toBe(duplicateKey);
  });

  it("submissions constraints: a score needs graded_at and graded_by, and cannot be negative", async () => {
    const now = new Date().toISOString();
    const partial = [
      { score: 5 },
      { score: 5, graded_at: now },
      { score: 5, graded_by: world.teacher.id },
      { graded_at: now, graded_by: world.teacher.id },
      { graded_by: world.teacher.id },
    ];
    for (const change of partial) expect(await insertCode(target, world.outsider.id, change)).toBe(checkFailed);
    const negative = { score: -1, graded_at: now, graded_by: world.teacher.id };
    expect(await insertCode(target, world.outsider.id, negative)).toBe(checkFailed);
  });

  it("submissions constraints: a file name with a slash, a hidden direction character or 121 characters is refused", async () => {
    expect(submissionLimits.fileNameLength).toBe(120);
    const names = ["", "folder/essay.pdf", "folder\\essay.pdf", "essay\u202Efdp.exe", "essay\u200B.pdf", " essay.pdf", "x".repeat(121)];
    for (const file_name of names) expect(await insertCode(target, world.outsider.id, { file_name })).toBe(checkFailed);
  });

  it("submissions constraints: an unknown mime, 0 bytes and more than 25 MB are refused", async () => {
    expect(submissionUpload.maxBytes).toBe(25 * megabyte);
    const changes = [
      { mime: "text/html" },
      { mime: "application/zip" },
      { mime: "application/vnd.ms-word.document.macroEnabled.12" },
      { size_bytes: 0 },
      { size_bytes: -1 },
      { size_bytes: submissionUpload.maxBytes + 1 },
    ];
    for (const change of changes) expect(await insertCode(target, world.outsider.id, change)).toBe(checkFailed);
  });

  it("submissions constraints: the largest valid row is accepted", async () => {
    const change = { file_name: "x".repeat(120), size_bytes: submissionUpload.maxBytes, mime: docxType };
    const row = validRow(target, world.outsider.id, change);
    row.file_path = row.file_path.replace(".pdf", ".docx");
    expect((await admin.from("submissions").insert(row as never)).error).toBeNull();
  });
});

describe("upload activities", () => {
  function insertUpload(points: unknown) {
    const row = { ...quizRow(world.classroom.id), type: "upload", ...(points === undefined ? {} : { points }) };
    return world.teacher.client.from("activities").insert(row as never).select(activityColumns);
  }

  function updateAs(actor: Actor, activityId: string, patch: Record<string, unknown>) {
    return actor.client.from("activities").update(patch as never).eq("id", activityId).select(activityColumns);
  }

  it("upload activities: an upload activity needs 1 to 1,000 points on insert", async () => {
    expect(submissionLimits.pointsMax).toBe(1000);
    for (const points of [undefined, 0, -5, 1001]) {
      const { data, error } = await insertUpload(points);
      expect(error?.code).toBe(checkFailed);
      expect(error?.message).toBe("activity_points_range");
      expect(data).toBeNull();
    }
    for (const points of [1, 1000]) {
      const { data, error } = await insertUpload(points);
      expect(error).toBeNull();
      expect(data![0]).toMatchObject({ type: "upload", points, published_at: null });
    }
  });

  it("upload activities: an upload activity is published with no questions", async () => {
    const draft = await upload({ published: false });
    const { data, error } = await updateAs(world.teacher, draft.id, { published_at: new Date().toISOString() });
    expect(error).toBeNull();
    expect(data![0].published_at).not.toBeNull();
  });

  it("upload activities: the type cannot change", async () => {
    const draft = await upload({ published: false });
    const quiz = (await addQuiz(world.teacher, world.classroom.id, [{ kind: "tf", key: true }])).activity;
    for (const [activity, other] of [[draft, "quiz"], [quiz, "upload"]] as const) {
      const asTeacher = await updateAs(world.teacher, activity.id, { type: other });
      expect(asTeacher.error?.code).toBe(refused);
      expect((await admin.from("activities").update({ type: other } as never).eq("id", activity.id)).error).toBeNull();
      expect((await readActivity(activity.id))!.type).toBe(activity.type);
    }
  });

  it("upload activities: quiz points written directly are ignored", async () => {
    const inserted = await world.teacher.client
      .from("activities")
      .insert({ ...quizRow(world.classroom.id), points: 50 } as never)
      .select(activityColumns);
    expect(inserted.error).toBeNull();
    expect(inserted.data![0]).toMatchObject({ type: "quiz", points: 0 });
    const quizId = inserted.data![0].id;
    expect((await saveQuestion(world.teacher.client, quizId, { kind: "tf", key: true, points: 3 })).result?.status).toBe("saved");
    const updated = await updateAs(world.teacher, quizId, { points: 50 });
    expect(updated.error).toBeNull();
    expect(updated.data![0].points).toBe(3);
    await setActivity(quizId, { points: 999 });
    expect((await readActivity(quizId))!.points).toBe(3);
  });

  it("upload activities: upload points can change before a grade and not after it", async () => {
    const target = await upload({ points: 20 });
    const row = await handIn(world.studentA, target.id);
    const before = await updateAs(world.teacher, target.id, { points: 30 });
    expect(before.error).toBeNull();
    expect(before.data![0].points).toBe(30);
    expect((await updateAs(world.teacher, target.id, { points: 1001 })).error?.code).toBe(checkFailed);

    expect((await gradeSubmission(world.teacher.client, row.id, row.upload_id, 30)).result?.status).toBe("graded");
    for (const points of [10, 29, 31, 1000]) {
      const after = await updateAs(world.teacher, target.id, { points });
      expect(after.error?.code).toBe(checkFailed);
      expect(after.error?.message).toBe("activity_has_grades");
    }
    const asAdmin = await admin.from("activities").update({ points: 10 }).eq("id", target.id);
    expect(asAdmin.error?.code).toBe(checkFailed);
    expect((await readActivity(target.id))!.points).toBe(30);
    const otherColumn = await updateAs(world.teacher, target.id, { title: "Renamed essay", points: 30 });
    expect(otherColumn.error).toBeNull();
  });

  it("upload activities: save_quiz_question on an upload activity fails", async () => {
    const draft = await upload({ published: false });
    const { result, error } = await saveQuestion(world.teacher.client, draft.id, { kind: "tf", key: true });
    expect(result).toBeNull();
    expect(error?.code).toBe(checkFailed);
    expect(error?.message).toBe("questions_need_a_quiz");
    const direct = await admin
      .from("quiz_questions")
      .insert({ activity_id: draft.id, kind: "tf", prompt: "A role can own a table.", points: 1, position: 1 });
    expect(direct.error?.code).toBe(checkFailed);
    const { count } = await admin.from("quiz_questions").select("id", { count: "exact", head: true }).eq("activity_id", draft.id);
    expect(count).toBe(0);
    expect((await readActivity(draft.id))!.points).toBe(20);
  });

  it("upload activities: unpublish is refused once a submission exists", async () => {
    const empty = await upload();
    const emptied = await updateAs(world.teacher, empty.id, { published_at: null });
    expect(emptied.error).toBeNull();
    expect(emptied.data![0].published_at).toBeNull();

    const refusedUpdate = await updateAs(world.teacher, essay.id, { published_at: null });
    expect(refusedUpdate.error?.code).toBe(checkFailed);
    expect(refusedUpdate.error?.message).toBe("activity_has_attempts");
    expect((await admin.from("activities").update({ published_at: null }).eq("id", essay.id)).error?.code).toBe(checkFailed);
    expect((await readActivity(essay.id))!.published_at).toBe(essay.published_at);
  });

  it("upload activities: unpublish is refused while an upload is in progress", async () => {
    const target = await upload();
    const pending = await addPending(target, world.studentA.id);
    const blocked = await updateAs(world.teacher, target.id, { published_at: null });
    expect(blocked.error?.code).toBe(checkFailed);
    expect(blocked.error?.message).toBe("activity_has_attempts");
    await admin.from("submission_uploads").delete().eq("id", pending.id);
    expect((await updateAs(world.teacher, target.id, { published_at: null })).error).toBeNull();
  });

  it("upload activities: deleting an upload activity with submissions is 23503", async () => {
    const target = await upload();
    await handIn(world.studentA, target.id);
    const { error } = await admin.from("activities").delete().eq("id", target.id);
    expect(error?.code).toBe(foreignKeyFailed);
    expect(await readActivity(target.id)).not.toBeNull();

    const pendingOnly = await upload();
    const pending = await addPending(pendingOnly, world.studentA.id);
    expect((await admin.from("activities").delete().eq("id", pendingOnly.id)).error).toBeNull();
    expect(await readPending(pending.id)).toBeNull();
  });
});
