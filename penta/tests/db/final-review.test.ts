import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  addDeck,
  addUpload,
  admin,
  completeSubmission,
  createRouteWorld,
  enrolledStudent,
  readSubmissionOf,
  recordView,
  removeCreatedUsers,
  removeFromClass,
  reserveSubmission,
} from "./helpers";

let world: Awaited<ReturnType<typeof createRouteWorld>>;

async function pendingUpload(client: Parameters<typeof reserveSubmission>[0], activityId: string) {
  const { result, error } = await reserveSubmission(client, activityId);
  if (error || result?.status !== "reserved" || !result.upload_id) throw new Error(`reserve_submission answered ${result?.status ?? error?.code}`);
  const { data } = await admin.from("submission_uploads").select("id, file_path").eq("id", result.upload_id).single();
  return data!;
}

async function uploadRows(uploadId: string): Promise<number> {
  const { count } = await admin.from("submission_uploads").select("id", { count: "exact", head: true }).eq("id", uploadId);
  return count ?? 0;
}

beforeAll(async () => {
  world = await createRouteWorld();
});

afterAll(removeCreatedUsers);

describe("deck_view_counts", () => {
  it("stops answering for a deck once the student is removed from the class", async () => {
    const student = await enrolledStudent(world.classroom.id, "view-counter");
    const deck = await addDeck(world.classroom.id, world.teacher.id);
    for (const slide of [1, 2, 3]) await recordView(deck.id, student.id, slide);
    expect((await student.client.rpc("deck_view_counts")).data).toEqual([{ deck_id: deck.id, viewed: 3 }]);

    await removeFromClass(world.teacher, world.classroom.id, student.id);
    const { data, error } = await student.client.rpc("deck_view_counts");
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });
});

describe("complete_submission", () => {
  it("refuses a hand-in reserved before the student was removed, and hands back the file path", async () => {
    const student = await enrolledStudent(world.classroom.id, "late-finisher");
    const essay = await addUpload(world.classroom.id, world.teacher.id, { published: true });
    const pending = await pendingUpload(student.client, essay.id);
    await removeFromClass(world.teacher, world.classroom.id, student.id);

    const { result, error } = await completeSubmission(admin, pending.id, 1024);
    expect(error).toBeNull();
    expect(result).toEqual({ status: "gone", file_path: pending.file_path });
    expect(await readSubmissionOf(essay.id, student.id)).toBeNull();
    expect(await uploadRows(pending.id)).toBe(0);
  });

  it("an activity cannot be unpublished while an upload is pending, so a hand-in never lands on a draft", async () => {
    const essay = await addUpload(world.classroom.id, world.teacher.id, { published: true });
    const pending = await pendingUpload(world.studentA.client, essay.id);
    const { error } = await admin.from("activities").update({ published_at: null }).eq("id", essay.id);
    expect(error?.code).toBe("23514");
    expect((await completeSubmission(admin, pending.id, 1024)).result?.status).toBe("completed");
  });

  it("still completes for an enrolled student on a published activity", async () => {
    const essay = await addUpload(world.classroom.id, world.teacher.id, { published: true });
    const pending = await pendingUpload(world.studentA.client, essay.id);
    expect((await completeSubmission(admin, pending.id, 1024)).result?.status).toBe("completed");
  });
});
