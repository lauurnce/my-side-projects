import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  addPost,
  anon,
  asked,
  classThreads,
  createRouteWorld,
  editPost,
  notFound,
  postHistory,
  posted,
  readPost,
  readPostEvents,
  readPosts,
  readProfile,
  readThread,
  refused,
  removeCreatedUsers,
  removeFromClass,
  renameSelf,
  setPostHidden,
  setThreadLocked,
  threadRoom,
  threadView,
} from "./helpers";

let world: Awaited<ReturnType<typeof createRouteWorld>>;

beforeAll(async () => {
  world = await createRouteWorld();
});

afterAll(removeCreatedUsers);

describe("who may moderate", () => {
  it("a student cannot hide a post", async () => {
    const room = await threadRoom();
    const { threadId, postId } = await asked(room.studentA, { lesson: room.lesson.id });
    const answerId = await posted(room.studentB, threadId);
    const before = { thread: await readThread(threadId), posts: await readPosts(threadId) };
    const random = (await setPostHidden(room.studentA.client, randomUUID(), true)).result;
    expect(random).toEqual(notFound);

    for (const caller of [room.studentA, room.studentB, world.otherTeacher, world.otherStudent, world.outsider]) {
      for (const target of [postId, answerId, randomUUID(), threadId]) {
        for (const hide of [true, false]) {
          const { result, error } = await setPostHidden(caller.client, target, hide);
          expect(error).toBeNull();
          expect(result).toEqual(random);
        }
      }
    }
    expect((await setPostHidden(room.teacher.client, randomUUID(), true)).result).toEqual(random);
    expect((await setPostHidden(room.teacher.client, postId, null as never)).result).toEqual(random);

    for (const target of [postId, answerId]) {
      const { result, error } = await setPostHidden(anon, target, true);
      expect(error?.code).toBe(refused);
      expect(result).toBeNull();
      expect(await readPostEvents(target)).toEqual([]);
    }
    expect({ thread: await readThread(threadId), posts: await readPosts(threadId) }).toEqual(before);
    const view = (await threadView(room.studentA.client, threadId)).view!;
    expect(view.posts!.map((post) => post.id)).toEqual([postId, answerId]);
  });

  it("a student cannot lock a thread", async () => {
    const room = await threadRoom();
    const { threadId } = await asked(room.studentA, { lesson: room.lesson.id });
    const before = await readThread(threadId);
    const random = (await setThreadLocked(room.studentA.client, randomUUID(), true)).result;
    expect(random).toEqual(notFound);

    for (const caller of [room.studentA, room.studentB, world.otherTeacher, world.otherStudent, world.outsider]) {
      for (const lock of [true, false]) {
        const { result, error } = await setThreadLocked(caller.client, threadId, lock);
        expect(error).toBeNull();
        expect(result).toEqual(random);
      }
    }
    expect((await setThreadLocked(room.teacher.client, randomUUID(), true)).result).toEqual(random);
    expect((await setThreadLocked(room.teacher.client, threadId, null as never)).result).toEqual(random);
    const anonymous = await setThreadLocked(anon, threadId, true);
    expect(anonymous.error?.code).toBe(refused);
    expect(anonymous.result).toBeNull();

    expect(await readThread(threadId)).toEqual(before);
    expect((await addPost(room.studentB.client, threadId)).result?.status).toBe("posted");
  });
});

describe("hiding and locking", () => {
  it("the class teacher hides and unhides, and each change writes one event", async () => {
    const room = await threadRoom();
    const { threadId } = await asked(room.studentA, { lesson: room.lesson.id });
    const answerId = await posted(room.studentB, threadId, null, "An unkind answer.");
    const version = (await readThread(threadId))!.version;
    const startedAt = Date.now();

    expect((await setPostHidden(room.teacher.client, answerId, false)).result).toEqual({ status: "shown" });
    expect(await readPostEvents(answerId)).toEqual([]);
    expect((await readThread(threadId))!.version).toBe(version);

    expect((await setPostHidden(room.teacher.client, answerId, true)).result).toEqual({ status: "hidden" });
    const hidden = (await readPost(answerId))!;
    expect(hidden.hidden_by).toBe(room.teacher.id);
    expect(Date.parse(hidden.hidden_at!)).toBeGreaterThan(startedAt - 5000);
    expect(hidden.body).toBe("An unkind answer.");

    expect((await setPostHidden(room.teacher.client, answerId, true)).result).toEqual({ status: "hidden" });
    expect(await readPost(answerId)).toEqual(hidden);
    expect(await readPostEvents(answerId)).toEqual([
      expect.objectContaining({ post_id: answerId, actor_id: room.teacher.id, kind: "hide", old_body: null }),
    ]);
    expect((await readThread(threadId))!.version).toBe(version + 1);

    expect((await setPostHidden(room.teacher.client, answerId, false)).result).toEqual({ status: "shown" });
    expect(await readPost(answerId)).toMatchObject({ hidden_at: null, hidden_by: null, body: "An unkind answer." });
    expect((await setPostHidden(room.teacher.client, answerId, false)).result).toEqual({ status: "shown" });
    const events = await readPostEvents(answerId);
    expect(events.map((event) => [event.kind, event.actor_id, event.old_body])).toEqual([
      ["hide", room.teacher.id, null],
      ["unhide", room.teacher.id, null],
    ]);
    expect((await readThread(threadId))!.version).toBe(version + 2);
  });

  it("a locked thread rejects new posts", async () => {
    const room = await threadRoom();
    const { threadId, postId } = await asked(room.studentA, { lesson: room.lesson.id });
    const answerId = await posted(room.studentB, threadId);
    const teacherPost = await posted(room.teacher, threadId);
    const startedAt = Date.now();

    expect((await setThreadLocked(room.teacher.client, threadId, true)).result).toEqual({ status: "locked" });
    const locked = (await readThread(threadId))!;
    expect(locked).toMatchObject({ locked: true, locked_by: room.teacher.id });
    expect(Date.parse(locked.locked_at!)).toBeGreaterThan(startedAt - 5000);
    expect((await setThreadLocked(room.teacher.client, threadId, true)).result).toEqual({ status: "locked" });
    expect(await readThread(threadId)).toMatchObject({ locked: true, locked_by: room.teacher.id, locked_at: locked.locked_at });

    const before = await readPosts(threadId);
    for (const actor of [room.studentA, room.studentB, room.teacher]) {
      expect((await addPost(actor.client, threadId)).result).toEqual({ status: "locked" });
      expect((await addPost(actor.client, threadId, answerId)).result).toEqual({ status: "locked" });
      expect((await addPost(actor.client, threadId, null, "")).result).toEqual({ status: "locked" });
    }
    expect((await editPost(room.studentA.client, postId, "Changed under lock.")).result).toEqual({ status: "locked" });
    expect((await editPost(room.studentB.client, answerId, "Changed under lock.")).result).toEqual({ status: "locked" });
    expect((await editPost(room.teacher.client, teacherPost, "Changed under lock.")).result).toEqual({ status: "locked" });
    expect(await readPosts(threadId)).toEqual(before);
    for (const actor of [room.studentA, room.teacher]) {
      const view = (await threadView(actor.client, threadId)).view!;
      expect(view.thread!.locked).toBe(true);
      const { rows } = await classThreads(actor.client, room.classroom.id);
      expect(rows![0]).toMatchObject({ thread_id: threadId, locked: true });
    }
    expect((await setPostHidden(room.teacher.client, answerId, true)).result).toEqual({ status: "hidden" });
    expect((await setPostHidden(room.teacher.client, answerId, false)).result).toEqual({ status: "shown" });

    expect((await setThreadLocked(room.teacher.client, threadId, false)).result).toEqual({ status: "unlocked" });
    expect(await readThread(threadId)).toMatchObject({ locked: false, locked_by: null, locked_at: null });
    expect((await addPost(room.studentA.client, threadId)).result?.status).toBe("posted");
    expect((await addPost(room.teacher.client, threadId, answerId)).result?.status).toBe("posted");
    expect((await editPost(room.studentB.client, answerId, "Changed after the unlock.")).result).toEqual({ status: "edited" });
    expect((await threadView(room.studentA.client, threadId)).view!.thread!.locked).toBe(false);
  });
});

describe("post_history", () => {
  it("returns edits with the old body, hides and unhides in order with actor names to the class teacher only", async () => {
    const room = await threadRoom();
    await renameSelf(room.teacher, "Maria Santos");
    await renameSelf(room.studentB, "Ben Cruz");
    const { threadId, postId } = await asked(room.studentA, { lesson: room.lesson.id });
    const answerId = await posted(room.studentB, threadId, null, "First wording.");
    expect((await editPost(room.studentB.client, answerId, "Second wording.")).result).toEqual({ status: "edited" });
    expect((await setPostHidden(room.teacher.client, answerId, true)).result).toEqual({ status: "hidden" });
    expect((await setPostHidden(room.teacher.client, answerId, false)).result).toEqual({ status: "shown" });
    expect((await editPost(room.studentB.client, answerId, "Third wording.")).result).toEqual({ status: "edited" });

    const history = await postHistory(room.teacher.client, answerId);
    expect(history.error).toBeNull();
    expect(history.rows!.map((row) => Object.keys(row).sort())[0]).toEqual(["actor_name", "happened_at", "kind", "old_body"]);
    expect(history.rows!.map((row) => [row.kind, row.old_body, row.actor_name])).toEqual([
      ["edit", "First wording.", "Ben Cruz"],
      ["hide", null, "Maria Santos"],
      ["unhide", null, "Maria Santos"],
      ["edit", "Second wording.", "Ben Cruz"],
    ]);
    const times = history.rows!.map((row) => Date.parse(row.happened_at));
    expect(times).toEqual([...times].sort((left, right) => left - right));
    expect((await postHistory(room.teacher.client, postId)).rows).toEqual([]);
    expect((await postHistory(room.teacher.client, randomUUID())).rows).toEqual([]);

    for (const caller of [room.studentB, room.studentA, world.otherTeacher, world.otherStudent, world.outsider]) {
      const { rows, error } = await postHistory(caller.client, answerId);
      expect(error).toBeNull();
      expect(rows).toEqual([]);
    }
    const anonymous = await postHistory(anon, answerId);
    expect(anonymous.error?.code).toBe(refused);
    expect(anonymous.rows).toBeNull();
  });
});

describe("a student removed from the class", () => {
  it("leaves posts that classmates still see with the name, and the teacher sees author_in_class false", async () => {
    const room = await threadRoom();
    const leaver = room.studentB;
    const name = (await readProfile(leaver.id)).full_name;
    const { threadId, postId } = await asked(room.studentA, { lesson: room.lesson.id });
    const answerId = await posted(leaver, threadId, null, "An answer from someone who left.");
    const own = await asked(leaver, { lesson: room.lesson.id }, "A question from someone who left");
    await removeFromClass(room.teacher, room.classroom.id, leaver.id);

    const classmate = (await threadView(room.studentA.client, threadId)).view!;
    expect(classmate.posts!.map((post) => [post.id, post.author_name, post.author_role, post.mine])).toEqual([
      [postId, (await readProfile(room.studentA.id)).full_name, "student", true],
      [answerId, name, "student", false],
    ]);
    expect((await threadView(room.studentA.client, own.threadId)).view!.posts![0]).toMatchObject({ author_name: name });
    const listed = await classThreads(room.studentA.client, room.classroom.id);
    expect(listed.rows!.map((row) => [row.thread_id, row.author_name]).sort()).toEqual(
      [
        [threadId, (await readProfile(room.studentA.id)).full_name],
        [own.threadId, name],
      ].sort(),
    );

    const teacher = (await threadView(room.teacher.client, threadId)).view!;
    expect(teacher.posts!.map((post) => [post.id, post.author_id, post.author_in_class])).toEqual([
      [postId, room.studentA.id, true],
      [answerId, leaver.id, false],
    ]);
    expect((await setPostHidden(room.teacher.client, answerId, true)).result).toEqual({ status: "hidden" });
    expect((await threadView(leaver.client, threadId)).view).toEqual(notFound);
    expect((await threadView(leaver.client, own.threadId)).view).toEqual(notFound);
  });
});
