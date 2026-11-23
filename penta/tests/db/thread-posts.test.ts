import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  addLesson,
  addModule,
  addPost,
  asked,
  classThreads,
  countPostsIn,
  createRouteWorld,
  editPost,
  forgetQuota,
  minutesAgo,
  notFound,
  posted,
  readPost,
  readPostEvents,
  readThread,
  removeCreatedUsers,
  removeFromClass,
  secondsAgo,
  seedPosts,
  seedThread,
  setPostCreatedAt,
  setPostHidden,
  setThreadLocked,
  threadRoom,
  threadView,
  type Actor,
  type Client,
} from "./helpers";

type Room = Awaited<ReturnType<typeof threadRoom>>;

const emoji = "\u{1F600}";
const mark = "́";
const refusedBodies: [string, string | null][] = [
  ["empty", ""],
  ["null", null],
  ["only spaces", "   \n \t "],
  ["only zero width characters", "​​﻿"],
  ["2,001 characters", "a".repeat(2001)],
  ["2,001 emoji", emoji.repeat(2001)],
  ["61 lines", Array.from({ length: 61 }, () => "a").join("\n")],
  ["three blank lines in a row", "a\n\n\n\nb"],
  ["999 list markers on one line", `${"- ".repeat(999)}a`],
  ["499 list and quote markers on one line", `${"- > ".repeat(499)}a`],
  ["660 numbered markers on one line", `${"1. ".repeat(660)}a`],
  ["twelve quote markers and 900 list markers", `${">".repeat(12)}${"- ".repeat(900)}a`],
  ["five nested markers", "- - - - - a"],
  ["five nested quotes", "> > > > > a"],
  ["a line indented by 17 spaces", `a\n${" ".repeat(17)}b`],
  ["a right to left override", "a‮b"],
  ["a left to right isolate", "a⁦b"],
  ["a zero width joiner", "a‍b"],
  ["a zero width space", "a​b"],
  ["a word joiner", "a⁠b"],
  ["a soft hyphen", "a­b"],
  ["five combining marks on one letter", `x${mark.repeat(5)}`],
  ["four combining marks on one letter", `x${mark.repeat(4)}`],
  ["a control character", "a\u0007b"],
];
const acceptedBodies: [string, string][] = [
  ["a normal paragraph", "The role can log in, but every query on the table fails. What is missing?"],
  ["2,000 characters", "a".repeat(2000)],
  ["2,000 emoji in 8,000 bytes", emoji.repeat(2000)],
  ["60 lines", Array.from({ length: 60 }, () => "a").join("\n")],
  ["two blank lines in a row", "a\n\n\nb"],
  ["a 4 level nested list", "- one\n    - two\n        - three\n            - four\n                still four"],
  ["four nested markers", "- - - - a"],
  ["four nested quotes", "> > > > quote"],
  ["a code block", "```sql\ngrant usage on schema public to report_reader;\n```"],
  ["ten asterisks", "**********"],
  ["a line of hyphens", "above\n\n----------\n\nbelow"],
  ["three combining marks on one letter", `x${mark.repeat(3)}`],
  ["Filipino text", "Magandang umaga po. Paano po mag-grant ng usage sa schema?"],
  ["Japanese text", "スキーマの権限について質問があります。"],
  ["an emoji", `Thank you ${emoji}`],
  ["a link", "See the [manual on privileges](https://www.postgresql.org/docs/current/ddl-priv.html)."],
  ["bold, italics and inline code", "Use **grant** with `usage`, _not_ `all`."],
];

let world: Awaited<ReturnType<typeof createRouteWorld>>;

async function viewOf(client: Client, threadId: string) {
  const { view, error } = await threadView(client, threadId);
  expect(error).toBeNull();
  return view!;
}

async function rowFor(client: Client, classId: string, threadId: string) {
  const { rows, error } = await classThreads(client, classId);
  expect(error).toBeNull();
  return rows!.find((row) => row.thread_id === threadId);
}

async function versionOf(threadId: string): Promise<number> {
  return (await readThread(threadId))!.version;
}

async function edited(actor: Actor, postId: string, body: string) {
  const { result, error } = await editPost(actor.client, postId, body);
  expect(error).toBeNull();
  expect(result).toEqual({ status: "edited" });
}

async function hide(room: Room, postId: string, hidden = true) {
  const { result, error } = await setPostHidden(room.teacher.client, postId, hidden);
  expect(error).toBeNull();
  expect(result).toEqual({ status: hidden ? "hidden" : "shown" });
}

beforeAll(async () => {
  world = await createRouteWorld();
});

afterAll(removeCreatedUsers);

describe("add_post", () => {
  it("answers posted for a top-level answer and for a reply under it, and stores the normalized body", async () => {
    const room = await threadRoom();
    const { threadId } = await asked(room.studentA, { lesson: room.lesson.id });
    const top = await addPost(room.studentB.client, threadId, null, "  Café notes\r\nsecond line\rthird line \n\n");
    expect(top.error).toBeNull();
    expect(top.result).toEqual({ status: "posted", post_id: expect.any(String) });
    expect(await readPost(top.result!.post_id!)).toMatchObject({
      thread_id: threadId,
      author_id: room.studentB.id,
      body: "Café notes\nsecond line\nthird line",
      parent_id: null,
      is_question: false,
      edit_count: 0,
      edited_at: null,
      hidden_at: null,
      hidden_by: null,
    });

    const reply = await addPost(room.teacher.client, threadId, top.result!.post_id!, "Good notes.");
    expect(reply.result).toEqual({ status: "posted", post_id: expect.any(String) });
    expect(await readPost(reply.result!.post_id!)).toMatchObject({
      thread_id: threadId,
      author_id: room.teacher.id,
      parent_id: top.result!.post_id,
      is_question: false,
      body: "Good notes.",
    });
    expect(await versionOf(threadId)).toBe(3);
  });

  it("answers bad_parent for a reply to a reply and not_found for a parent the caller cannot use", async () => {
    const room = await threadRoom();
    const first = await asked(room.studentA, { lesson: room.lesson.id });
    const second = await asked(room.studentA, { lesson: room.lesson.id });
    const topId = await posted(room.studentB, first.threadId);
    const replyId = await posted(room.studentB, first.threadId, topId);
    const hiddenTop = await posted(room.studentB, first.threadId);
    const elsewhere = await posted(room.studentB, second.threadId);
    const otherModule = await addModule(world.otherClassroom.id, "Week 1");
    const otherLesson = await addLesson(otherModule.id, "Indexes", true);
    const foreign = await seedThread(world.otherClassroom.id, { lesson: otherLesson.id });
    await hide(room, hiddenTop);
    const before = await countPostsIn(first.threadId);
    const version = await versionOf(first.threadId);

    expect((await addPost(room.studentA.client, first.threadId, replyId)).result).toEqual({ status: "bad_parent" });
    for (const parent of [elsewhere, second.postId, foreign.postId, randomUUID(), hiddenTop]) {
      const { result, error } = await addPost(room.studentA.client, first.threadId, parent);
      expect(error).toBeNull();
      expect(result).toEqual(notFound);
    }
    expect((await addPost(room.studentA.client, foreign.threadId, foreign.postId)).result).toEqual(notFound);
    expect((await addPost(room.studentA.client, randomUUID())).result).toEqual(notFound);
    expect(await countPostsIn(first.threadId)).toBe(before);
    expect(await versionOf(first.threadId)).toBe(version);

    expect((await addPost(room.teacher.client, first.threadId, hiddenTop)).result?.status).toBe("posted");
    expect((await addPost(room.studentA.client, first.threadId, first.postId)).result?.status).toBe("posted");
  });
});

describe("post body rules", () => {
  let room: Room;
  let threadId: string;

  beforeAll(async () => {
    room = await threadRoom();
    threadId = (await asked(room.studentA, { lesson: room.lesson.id })).threadId;
  });

  it.each(refusedBodies)("answers bad_body for a body that is %s", async (_label, body) => {
    const before = await countPostsIn(threadId);
    const { result, error } = await addPost(room.studentB.client, threadId, null, body);
    expect(error).toBeNull();
    expect(result).toEqual({ status: "bad_body" });
    expect(await countPostsIn(threadId)).toBe(before);
  });

  it.each(acceptedBodies)("accepts a body that is %s", async (_label, body) => {
    const { result, error } = await addPost(room.studentB.client, threadId, null, body);
    expect(error).toBeNull();
    expect(result?.status).toBe("posted");
    expect((await readPost(result!.post_id!))!.body).toBe(body.normalize("NFC"));
    await forgetQuota([room.studentB.id]);
  });

  it("counts 2,000 emoji as 2,000 characters and 8,000 bytes, the largest body there is", async () => {
    const body = emoji.repeat(2000);
    expect([...body]).toHaveLength(2000);
    expect(Buffer.byteLength(body, "utf8")).toBe(8000);
    const { view } = await threadView(room.studentA.client, threadId);
    expect(view!.posts!.some((post) => post.body === body)).toBe(true);
    expect(view!.posts).toHaveLength(1 + acceptedBodies.length);
  });
});

describe("edit_post", () => {
  it("answers edited, sets the body, edited_at and edit_count, and keeps the old body in an event", async () => {
    const room = await threadRoom();
    const { threadId } = await asked(room.studentA, { lesson: room.lesson.id });
    const postId = await posted(room.studentB, threadId, null, "First wording.");
    const version = await versionOf(threadId);

    const same = await editPost(room.studentB.client, postId, "  First wording.\r\n");
    expect(same.result).toEqual({ status: "unchanged" });
    expect(await readPost(postId)).toMatchObject({ body: "First wording.", edit_count: 0, edited_at: null });
    expect(await readPostEvents(postId)).toEqual([]);
    expect(await versionOf(threadId)).toBe(version);

    for (const body of ["", "   ", "a".repeat(2001), "a‍b", `${"- ".repeat(999)}a`]) {
      expect((await editPost(room.studentB.client, postId, body)).result).toEqual({ status: "bad_body" });
    }
    expect(await readPost(postId)).toMatchObject({ body: "First wording.", edit_count: 0, edited_at: null });
    expect(await readPostEvents(postId)).toEqual([]);

    const startedAt = Date.now();
    await edited(room.studentB, postId, " Second wording.\r\nWith a line. ");
    const row = (await readPost(postId))!;
    expect(row).toMatchObject({ body: "Second wording.\nWith a line.", edit_count: 1, author_id: room.studentB.id });
    expect(Date.parse(row.edited_at!)).toBeGreaterThan(startedAt - 5000);
    expect(await readPostEvents(postId)).toEqual([
      expect.objectContaining({ post_id: postId, actor_id: room.studentB.id, kind: "edit", old_body: "First wording." }),
    ]);
    expect(await versionOf(threadId)).toBe(version + 1);
    const view = await viewOf(room.studentA.client, threadId);
    expect(view.posts!.find((post) => post.id === postId)).toMatchObject({
      body: "Second wording.\nWith a line.",
      edited_at: row.edited_at,
    });
  });

  it("answers too_many_edits on the fourth edit", async () => {
    const room = await threadRoom();
    const { threadId, postId } = await asked(room.studentA, { lesson: room.lesson.id }, "Why?", "Draft 0");
    for (const body of ["Draft 1", "Draft 2", "Draft 3"]) await edited(room.studentA, postId, body);
    const version = await versionOf(threadId);

    expect((await editPost(room.studentA.client, postId, "Draft 4")).result).toEqual({ status: "too_many_edits" });
    expect((await editPost(room.studentA.client, postId, "Draft 3")).result).toEqual({ status: "too_many_edits" });
    expect(await readPost(postId)).toMatchObject({ body: "Draft 3", edit_count: 3 });
    const events = await readPostEvents(postId);
    expect(events.map((event) => [event.kind, event.old_body])).toEqual([
      ["edit", "Draft 0"],
      ["edit", "Draft 1"],
      ["edit", "Draft 2"],
    ]);
    expect(await versionOf(threadId)).toBe(version);
  });

  it("answers too_late after 15 minutes and still edits at 14 minutes", async () => {
    const room = await threadRoom();
    const { threadId } = await asked(room.studentA, { lesson: room.lesson.id });
    const postId = await posted(room.studentB, threadId, null, "Written a while ago.");

    await setPostCreatedAt([postId], minutesAgo(14));
    await edited(room.studentB, postId, "Fixed at 14 minutes.");

    await setPostCreatedAt([postId], secondsAgo(15 * 60 + 2));
    expect((await editPost(room.studentB.client, postId, "Fixed too late.")).result).toEqual({ status: "too_late" });
    expect((await editPost(room.studentB.client, postId, "Fixed at 14 minutes.")).result).toEqual({ status: "too_late" });
    expect(await readPost(postId)).toMatchObject({ body: "Fixed at 14 minutes.", edit_count: 1 });
    expect(await readPostEvents(postId)).toHaveLength(1);
  });

  it("answers locked in a locked thread", async () => {
    const room = await threadRoom();
    const { threadId, postId } = await asked(room.studentA, { lesson: room.lesson.id });
    const teacherPost = await posted(room.teacher, threadId);
    expect((await setThreadLocked(room.teacher.client, threadId, true)).result).toEqual({ status: "locked" });

    expect((await editPost(room.studentA.client, postId, "Changed after the lock.")).result).toEqual({ status: "locked" });
    expect((await editPost(room.teacher.client, teacherPost, "Changed after the lock.")).result).toEqual({ status: "locked" });
    expect(await readPostEvents(postId)).toEqual([]);

    expect((await setThreadLocked(room.teacher.client, threadId, false)).result).toEqual({ status: "unlocked" });
    await edited(room.studentA, postId, "Changed after the unlock.");
  });

  it("answers not_found the same way for every post the caller cannot edit", async () => {
    const room = await threadRoom();
    const leaver = await (async () => {
      const side = await threadRoom();
      return { ...side, student: side.studentB };
    })();
    const open = await asked(room.studentA, { lesson: room.lesson.id });
    const ownHidden = await posted(room.studentA, open.threadId, null, "My hidden answer.");
    const classmatePost = await posted(room.studentB, open.threadId, null, "A classmate's answer.");
    const teacherPost = await posted(room.teacher, open.threadId, null, "The teacher's answer.");
    const underHidden = await posted(room.studentB, open.threadId, ownHidden, "Under a hidden answer.");
    const concealed = await asked(room.studentB, { lesson: room.lesson.id });
    const inConcealed = await posted(room.studentA, concealed.threadId, null, "Under a hidden question.");
    await hide(room, ownHidden);
    await hide(room, concealed.postId);

    const leaverThread = await asked(leaver.student, { lesson: leaver.lesson.id });
    await removeFromClass(leaver.teacher, leaver.classroom.id, leaver.student.id);

    const attempts: [Actor, string][] = [
      [room.studentA, classmatePost],
      [room.studentA, teacherPost],
      [room.teacher, classmatePost],
      [room.teacher, ownHidden],
      [room.studentA, ownHidden],
      [room.studentB, underHidden],
      [room.studentA, inConcealed],
      [room.studentB, concealed.postId],
      [leaver.student, leaverThread.postId],
      [world.otherTeacher, classmatePost],
      [world.otherStudent, classmatePost],
      [room.studentA, randomUUID()],
      [room.studentA, open.threadId],
    ];
    const random = (await editPost(room.studentA.client, randomUUID(), "Rewritten.")).result;
    expect(random).toEqual(notFound);
    for (const [actor, postId] of attempts) {
      const { result, error } = await editPost(actor.client, postId, "Rewritten.");
      expect(error).toBeNull();
      expect(result).toEqual(random);
      expect((await editPost(actor.client, postId, "")).result).toEqual(random);
    }

    for (const postId of [ownHidden, classmatePost, teacherPost, underHidden, inConcealed, concealed.postId, leaverThread.postId]) {
      expect(await readPost(postId)).toMatchObject({ edit_count: 0, edited_at: null });
      expect((await readPostEvents(postId)).filter((event) => event.kind === "edit")).toEqual([]);
    }
    expect((await readPost(leaverThread.postId))!.body).toBe("The restore stops at the first table.");
  });
});

describe("thread_view", () => {
  it("can_edit is true only for the author within the window, under 3 edits, not hidden, not locked", async () => {
    const room = await threadRoom();
    const { threadId, postId } = await asked(room.studentA, { lesson: room.lesson.id });
    const fresh = await posted(room.studentB, threadId, null, "Fresh.");
    const worn = await posted(room.studentB, threadId, null, "Worn 0");
    const old = await posted(room.studentB, threadId, null, "Old.");
    const edge = await posted(room.studentB, threadId, null, "Edge.");
    const teacherHidden = await posted(room.teacher, threadId, null, "Teacher, hidden.");
    const teacherOpen = await posted(room.teacher, threadId, null, "Teacher, open.");
    for (const body of ["Worn 1", "Worn 2", "Worn 3"]) await edited(room.studentB, worn, body);
    await setPostCreatedAt([old], secondsAgo(15 * 60 + 2));
    await setPostCreatedAt([edge], minutesAgo(14));
    await hide(room, teacherHidden);

    const flags = async (actor: Actor) =>
      Object.fromEntries((await viewOf(actor.client, threadId)).posts!.map((post) => [post.id, post.can_edit]));
    expect(await flags(room.studentB)).toEqual({
      [postId]: false,
      [fresh]: true,
      [worn]: false,
      [old]: false,
      [edge]: true,
      [teacherOpen]: false,
    });
    expect(await flags(room.studentA)).toEqual({
      [postId]: true,
      [fresh]: false,
      [worn]: false,
      [old]: false,
      [edge]: false,
      [teacherOpen]: false,
    });
    expect(await flags(room.teacher)).toEqual({
      [postId]: false,
      [fresh]: false,
      [worn]: false,
      [old]: false,
      [edge]: false,
      [teacherHidden]: false,
      [teacherOpen]: true,
    });

    expect((await setThreadLocked(room.teacher.client, threadId, true)).result).toEqual({ status: "locked" });
    for (const actor of [room.studentA, room.studentB, room.teacher]) {
      expect(Object.values(await flags(actor)).every((flag) => flag === false)).toBe(true);
    }
  });

  it("a hidden post is not returned to students", async () => {
    const room = await threadRoom();
    const classId = room.classroom.id;
    const { threadId, postId } = await asked(room.studentA, { lesson: room.lesson.id });
    const topId = await posted(room.studentB, threadId, null, "Take a base backup first.");
    const teacherTop = await posted(room.teacher, threadId, null, "Then archive the log.");
    const rowBefore = (await rowFor(room.studentA.client, classId, threadId))!;
    const replyId = await posted(room.studentA, threadId, topId, "Secret words in a reply.");
    const rowWithReply = (await rowFor(room.studentA.client, classId, threadId))!;
    expect(rowWithReply.replies).toBe(rowBefore.replies + 1);
    expect(rowWithReply.last_post_at).toBe((await readPost(replyId))!.created_at);
    const idsSeenBy = async (actor: Actor) => (await viewOf(actor.client, threadId)).posts!.map((post) => post.id);

    await hide(room, replyId);
    for (const student of [room.studentA, room.studentB]) {
      const view = await viewOf(student.client, threadId);
      expect(view.posts!.map((post) => post.id)).toEqual([postId, topId, teacherTop]);
      expect(JSON.stringify(view)).not.toContain(replyId);
      expect(JSON.stringify(view)).not.toContain("Secret words");
      expect(await rowFor(student.client, classId, threadId)).toEqual(rowBefore);
    }
    const teacherView = await viewOf(room.teacher.client, threadId);
    expect(teacherView.posts!.map((post) => [post.id, post.hidden])).toEqual([
      [postId, false],
      [topId, false],
      [teacherTop, false],
      [replyId, true],
    ]);
    expect(await rowFor(room.teacher.client, classId, threadId)).toMatchObject({
      replies: 3,
      hidden_posts: 1,
      last_post_at: rowWithReply.last_post_at,
    });

    await hide(room, replyId, false);
    expect(await idsSeenBy(room.studentB)).toEqual([postId, topId, teacherTop, replyId]);
    expect(await rowFor(room.studentB.client, classId, threadId)).toEqual(rowWithReply);

    await hide(room, topId);
    for (const student of [room.studentA, room.studentB]) {
      const view = await viewOf(student.client, threadId);
      expect(view.posts!.map((post) => post.id)).toEqual([postId, teacherTop]);
      expect(JSON.stringify(view)).not.toContain(topId);
      expect(JSON.stringify(view)).not.toContain(replyId);
      expect(JSON.stringify(view)).not.toContain("Secret words");
      expect(JSON.stringify(view)).not.toContain("base backup");
      expect(await rowFor(student.client, classId, threadId)).toMatchObject({
        replies: 1,
        last_post_at: (await readPost(teacherTop))!.created_at,
        hidden_posts: 0,
      });
    }
    expect((await viewOf(room.teacher.client, threadId)).posts!.map((post) => [post.id, post.hidden])).toEqual([
      [postId, false],
      [topId, true],
      [teacherTop, false],
      [replyId, false],
    ]);
    expect(await rowFor(room.teacher.client, classId, threadId)).toMatchObject({ replies: 3, hidden_posts: 2 });

    await hide(room, topId, false);
    expect(await idsSeenBy(room.studentA)).toEqual([postId, topId, teacherTop, replyId]);

    await hide(room, postId);
    for (const student of [room.studentA, room.studentB]) {
      expect(await viewOf(student.client, threadId)).toEqual(notFound);
      expect((await threadView(student.client, threadId, rowWithReply.replies)).view).toEqual(notFound);
      expect(await rowFor(student.client, classId, threadId)).toBeUndefined();
      expect((await addPost(student.client, threadId)).result).toEqual(notFound);
    }
    const hiddenQuestion = await viewOf(room.teacher.client, threadId);
    expect(hiddenQuestion.posts).toHaveLength(4);
    expect(hiddenQuestion.posts!.find((post) => post.id === postId)).toMatchObject({ hidden: true, is_question: true });
    expect(await rowFor(room.teacher.client, classId, threadId)).toMatchObject({ question_hidden: true, hidden_posts: 1, replies: 3 });

    await hide(room, postId, false);
    expect(await idsSeenBy(room.studentA)).toEqual([postId, topId, teacherTop, replyId]);
    expect(await rowFor(room.studentA.client, classId, threadId)).toEqual(rowWithReply);
  });

  it("answers unchanged for the known version and ok after a post, an edit, a hide or a lock raised it by one", async () => {
    const room = await threadRoom();
    const { threadId, postId } = await asked(room.studentA, { lesson: room.lesson.id });
    let version = (await viewOf(room.studentA.client, threadId)).version!;
    expect(version).toBe(1);
    let answerId = "";

    const changes = [
      async () => {
        answerId = await posted(room.studentB, threadId);
      },
      () => edited(room.studentA, postId, "A clearer question."),
      () => hide(room, answerId),
      () => hide(room, answerId, false),
      async () => {
        expect((await setThreadLocked(room.teacher.client, threadId, true)).result).toEqual({ status: "locked" });
      },
      async () => {
        expect((await setThreadLocked(room.teacher.client, threadId, false)).result).toEqual({ status: "unlocked" });
      },
    ];
    for (const change of changes) {
      for (const reader of [room.studentA, room.teacher]) {
        expect((await threadView(reader.client, threadId, version)).view).toEqual({ status: "unchanged", version });
      }
      await change();
      const after = (await threadView(room.studentA.client, threadId, version)).view!;
      expect(after.status).toBe("ok");
      expect(after.version).toBe(version + 1);
      expect(after.posts).toBeDefined();
      version = after.version!;
    }
    expect((await threadView(room.studentA.client, threadId, version + 5)).view?.status).toBe("ok");
    expect((await threadView(room.studentA.client, threadId, 0)).view?.status).toBe("ok");
    expect(await seedPosts(threadId, [{}])).toHaveLength(1);
    expect((await threadView(room.studentA.client, threadId, version)).view).toEqual({ status: "unchanged", version });
  });
});
