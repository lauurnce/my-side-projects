import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  addLesson,
  addModule,
  addPost,
  addUpload,
  admin,
  anon,
  askQuestion,
  asked,
  checkFailed,
  classThreads,
  countPostsBy,
  countPostsIn,
  countThreadsBy,
  createRouteWorld,
  deleteAccount,
  duplicateKey,
  editPost,
  foreignKeyFailed,
  minutesAgo,
  notFound,
  postHistory,
  posted,
  readPost,
  readPosts,
  readProfile,
  readThread,
  refused,
  removeCreatedUsers,
  removeFromClass,
  renameSelf,
  seedPosts,
  seedThread,
  seedThreads,
  setActivity,
  setPostHidden,
  setPublished,
  setThreadLocked,
  threadRoom,
  threadView,
  type Actor,
  type Client,
} from "./helpers";

type Lesson = Awaited<ReturnType<typeof addLesson>>;
type Activity = Awaited<ReturnType<typeof addUpload>>;

const tables = ["threads", "posts", "post_events"] as const;
const changes = { threads: { title: "Changed" }, posts: { body: "Changed" }, post_events: { kind: "edit" } };
const studentPostKeys = [
  "author_name",
  "author_role",
  "body",
  "can_edit",
  "created_at",
  "edited_at",
  "id",
  "is_question",
  "mine",
  "parent_id",
];
const teacherPostKeys = [...studentPostKeys, "author_id", "author_in_class", "edit_count", "hidden"].sort();
const summaryKeys = [
  "activity_id",
  "author_name",
  "author_role",
  "created_at",
  "hidden_posts",
  "last_post_at",
  "lesson_id",
  "locked",
  "question_hidden",
  "replies",
  "target_title",
  "thread_id",
  "title",
];

let world: Awaited<ReturnType<typeof createRouteWorld>>;
let otherLesson: Lesson;

type Room = Awaited<ReturnType<typeof threadRoom>>;

function lessonIn(room: Room, published = true) {
  return addLesson(room.moduleId, `Lesson ${randomUUID().slice(0, 8)}`, published);
}

function activityIn(room: Room, published = true): Promise<Activity> {
  return addUpload(room.classroom.id, room.teacher.id, { published });
}

async function threadIdsFor(client: Client, classId: string): Promise<string[]> {
  const { rows, error } = await classThreads(client, classId);
  expect(error).toBeNull();
  return rows!.map((row) => row.thread_id);
}

async function viewOf(client: Client, threadId: string) {
  const { view, error } = await threadView(client, threadId);
  expect(error).toBeNull();
  return view!;
}

async function nameOf(actor: Actor): Promise<string> {
  return (await readProfile(actor.id)).full_name;
}

beforeAll(async () => {
  world = await createRouteWorld();
  const otherModule = await addModule(world.otherClassroom.id, "Week 1");
  otherLesson = await addLesson(otherModule.id, "Indexes", true);
});

afterAll(removeCreatedUsers);

describe("thread tables are closed to the API", () => {
  const callers = [
    ["a student", () => world.studentA.client],
    ["the class teacher", () => world.teacher.client],
    ["anon", () => anon],
  ] as const;

  describe.each(callers)("%s", (_label, clientOf) => {
    it.each(tables)("gets 42501 for select, insert, update and delete on %s", async (table) => {
      const client = clientOf();
      const target = client.from(table as "threads");
      const selected = await target.select("id");
      const inserted = await client.from(table as "threads").insert(changes[table] as never);
      const updated = await client.from(table as "threads").update(changes[table] as never).eq("id", randomUUID());
      const deleted = await client.from(table as "threads").delete().eq("id", randomUUID());
      for (const answer of [selected, inserted, updated, deleted]) {
        expect(answer.error?.code).toBe(refused);
        expect(answer.data).toBeNull();
      }
    });

    it("gets 42501 for threads, posts and events embedded in lessons, activities and classes", async () => {
      const client = clientOf();
      const embeds = [
        client.from("lessons").select("id, threads(id)"),
        client.from("lessons").select("id, threads(id, posts(id, post_events(id)))"),
        client.from("activities").select("id, threads(id)"),
        client.from("activities").select("id, threads(title, posts(body))"),
        client.from("classes").select("id, threads(id)"),
        client.from("classes").select("id, threads(id, posts(author_id))"),
      ];
      for (const answer of await Promise.all(embeds)) {
        expect(answer.error?.code).toBe(refused);
        expect(answer.data).toBeNull();
      }
    });
  });
});

describe("thread visibility for outsiders", () => {
  it("an outsider reads nothing", async () => {
    const room = await threadRoom();
    const { threadId, postId } = await asked(room.studentA, { lesson: room.lesson.id });
    const answerId = await posted(room.studentB, threadId);
    const before = { thread: await readThread(threadId), posts: await readPosts(threadId) };

    for (const stranger of [world.otherStudent, world.otherTeacher, world.outsider]) {
      const listed = await classThreads(stranger.client, room.classroom.id);
      expect(listed.error).toBeNull();
      expect(listed.rows).toEqual([]);

      const answers = [];
      for (const [thread, post, parent] of [
        [threadId, postId, answerId],
        [randomUUID(), randomUUID(), randomUUID()],
      ]) {
        const history = await postHistory(stranger.client, post);
        expect(history.error).toBeNull();
        expect(history.rows).toEqual([]);
        answers.push([
          (await threadView(stranger.client, thread)).view,
          (await threadView(stranger.client, thread, 1)).view,
          (await addPost(stranger.client, thread)).result,
          (await addPost(stranger.client, thread, parent)).result,
          (await editPost(stranger.client, post, "Rewritten by a stranger.")).result,
          (await setPostHidden(stranger.client, post, true)).result,
          (await setThreadLocked(stranger.client, thread, true)).result,
        ]);
      }
      expect(answers[0]).toEqual(answers[1]);
      for (const answer of answers[0]) expect(answer).toEqual(notFound);
    }

    const anonymous = [
      await classThreads(anon, room.classroom.id),
      await threadView(anon, threadId),
      await addPost(anon, threadId),
      await editPost(anon, postId, "Rewritten by nobody."),
      await setPostHidden(anon, postId, true),
      await setThreadLocked(anon, threadId, true),
      await postHistory(anon, postId),
      await askQuestion(anon, { lesson: room.lesson.id }),
    ];
    for (const answer of anonymous) expect(answer.error?.code).toBe(refused);

    expect({ thread: await readThread(threadId), posts: await readPosts(threadId) }).toEqual(before);
  });
});

describe("ask_question", () => {
  it("answers asked for an enrolled student on a published lesson and on a published activity", async () => {
    const room = await threadRoom();
    const activity = await activityIn(room);
    const name = await nameOf(room.studentA);
    const onLesson = await askQuestion(
      room.studentA.client,
      { lesson: room.lesson.id },
      "  Why   does\n the restore fail?  ",
      "  It stops at the first table.\r\n",
    );
    expect(onLesson.error).toBeNull();
    expect(onLesson.result).toEqual({ status: "asked", thread_id: expect.any(String), post_id: expect.any(String) });
    expect(await readThread(onLesson.result!.thread_id!)).toMatchObject({
      class_id: room.classroom.id,
      lesson_id: room.lesson.id,
      activity_id: null,
      title: "Why does the restore fail?",
      created_by: room.studentA.id,
      locked: false,
      locked_by: null,
      locked_at: null,
      version: 1,
    });
    expect(await readPosts(onLesson.result!.thread_id!)).toEqual([
      expect.objectContaining({
        id: onLesson.result!.post_id,
        is_question: true,
        author_id: room.studentA.id,
        author_name: name,
        body: "It stops at the first table.",
        parent_id: null,
        edit_count: 0,
        hidden_at: null,
      }),
    ]);

    const onActivity = await askQuestion(room.studentA.client, { activity: activity.id });
    expect(onActivity.result?.status).toBe("asked");
    expect(await readThread(onActivity.result!.thread_id!)).toMatchObject({
      class_id: room.classroom.id,
      lesson_id: null,
      activity_id: activity.id,
      created_by: room.studentA.id,
    });
    expect(await readPost(onActivity.result!.post_id!)).toMatchObject({ is_question: true, author_name: name });
  });

  it("answers asked for the class teacher, also on a draft lesson and a draft activity", async () => {
    const room = await threadRoom();
    const name = await nameOf(room.teacher);
    const targets = [
      { lesson: room.lesson.id },
      { activity: (await activityIn(room)).id },
      { lesson: (await lessonIn(room, false)).id },
      { activity: (await activityIn(room, false)).id },
    ];
    for (const target of targets) {
      const { result, error } = await askQuestion(room.teacher.client, target);
      expect(error).toBeNull();
      expect(result?.status).toBe("asked");
      expect(await readThread(result!.thread_id!)).toMatchObject({
        class_id: room.classroom.id,
        lesson_id: target.lesson ?? null,
        activity_id: target.activity ?? null,
        created_by: room.teacher.id,
      });
      expect(await readPost(result!.post_id!)).toMatchObject({ is_question: true, author_name: name, author_id: room.teacher.id });
    }
  });

  it("answers not_found for a wrong target, a draft, another class and a removed student", async () => {
    const room = await threadRoom();
    const activity = await activityIn(room);
    const targets = [
      { lesson: room.lesson.id, activity: activity.id },
      {},
      { lesson: (await lessonIn(room, false)).id },
      { activity: (await activityIn(room, false)).id },
      { lesson: otherLesson.id },
      { lesson: randomUUID() },
      { activity: randomUUID() },
      { lesson: activity.id },
      { activity: room.lesson.id },
    ];
    for (const target of targets) {
      const { result, error } = await askQuestion(room.studentA.client, target);
      expect(error).toBeNull();
      expect(result).toEqual(notFound);
    }
    expect(await countThreadsBy(room.studentA.id)).toBe(0);

    expect((await askQuestion(room.studentB.client, { lesson: room.lesson.id })).result?.status).toBe("asked");
    await removeFromClass(room.teacher, room.classroom.id, room.studentB.id);
    expect((await askQuestion(room.studentB.client, { lesson: room.lesson.id })).result).toEqual(notFound);
    expect((await askQuestion(room.studentB.client, { activity: activity.id })).result).toEqual(notFound);
    expect(await countThreadsBy(room.studentB.id)).toBe(1);
    expect((await askQuestion(world.otherTeacher.client, { lesson: room.lesson.id })).result).toEqual(notFound);
    expect((await askQuestion(world.outsider.client, { activity: activity.id })).result).toEqual(notFound);
    expect((await askQuestion(world.otherStudent.client, { lesson: room.lesson.id })).result).toEqual(notFound);
  });

  it("answers bad_title for an empty, blank, too long or unclean title and accepts 160 characters", async () => {
    const room = await threadRoom();
    const titles = ["", null, "   \n\t ", "a".repeat(161), "Why​not", "Why ‮not", "Why\u0007not", "Why⁠not"];
    for (const title of titles) {
      const { result, error } = await askQuestion(room.studentA.client, { lesson: room.lesson.id }, title);
      expect(error).toBeNull();
      expect(result, JSON.stringify(title)).toEqual({ status: "bad_title" });
    }
    expect(await countThreadsBy(room.studentA.id)).toBe(0);

    const longest = await asked(room.studentA, { lesson: room.lesson.id }, "a".repeat(160));
    expect((await readThread(longest.threadId))!.title).toHaveLength(160);
    const mixed = await asked(room.studentA, { lesson: room.lesson.id }, "Paano po ito? 権限の質問");
    expect((await readThread(mixed.threadId))!.title).toBe("Paano po ito? 権限の質問");
  });

  it("answers bad_body for a question body that breaks the body rules", async () => {
    const room = await threadRoom();
    const bodies = [
      "",
      null,
      " \n \n ",
      "a".repeat(2001),
      Array.from({ length: 61 }, () => "a").join("\n"),
      "Where​is it?",
      `${"- ".repeat(999)}a`,
    ];
    for (const body of bodies) {
      const { result, error } = await askQuestion(room.studentA.client, { lesson: room.lesson.id }, "Why?", body);
      expect(error).toBeNull();
      expect(result, JSON.stringify(body)?.slice(0, 40)).toEqual({ status: "bad_body" });
    }
    expect(await countThreadsBy(room.studentA.id)).toBe(0);
    expect(await countPostsBy(room.studentA.id)).toBe(0);
  });

  it("answers full at 50 threads on one lesson and on one activity", async () => {
    const room = await threadRoom();
    for (const target of [{ lesson: room.lesson.id }, { activity: (await activityIn(room)).id }]) {
      const asker = target.lesson ? room.studentA : room.studentB;
      await seedThreads(room.classroom.id, target, 49);
      expect((await askQuestion(asker.client, target)).result?.status).toBe("asked");
      expect((await askQuestion(asker.client, target)).result).toEqual({ status: "full" });
      expect((await askQuestion(room.teacher.client, target)).result).toEqual({ status: "full" });
      expect(await countThreadsBy(asker.id)).toBe(1);
      expect(await countPostsBy(asker.id)).toBe(1);
      const column = target.lesson ? "lesson_id" : "activity_id";
      const { count } = await admin
        .from("threads")
        .select("id", { count: "exact", head: true })
        .eq(column, (target.lesson ?? target.activity)!);
      expect(count).toBe(50);
    }
    expect(await countThreadsBy(room.teacher.id)).toBe(0);
  });

  it("answers bad_name for a student named like the class teacher, and the teacher still posts", async () => {
    const room = await threadRoom();
    await renameSelf(room.teacher, "Maria Santos");
    const target = { lesson: room.lesson.id };
    const { threadId } = await asked(room.studentA, target);

    for (const copied of ["Maria Santos", "maria  SANTOS", "MARIA SANTOS", "Maria Santos"]) {
      await renameSelf(room.studentA, copied);
      expect((await askQuestion(room.studentA.client, target)).result, copied).toEqual({ status: "bad_name" });
      expect((await addPost(room.studentA.client, threadId)).result, copied).toEqual({ status: "bad_name" });
    }
    expect(await countThreadsBy(room.studentA.id)).toBe(1);
    expect(await countPostsIn(threadId)).toBe(1);

    expect((await askQuestion(room.teacher.client, target)).result?.status).toBe("asked");
    expect((await addPost(room.teacher.client, threadId)).result?.status).toBe("posted");
    expect((await addPost(room.studentB.client, threadId)).result?.status).toBe("posted");

    await renameSelf(room.studentA, "Mario Santos");
    expect((await askQuestion(room.studentA.client, target)).result?.status).toBe("asked");
    expect((await addPost(room.studentA.client, threadId)).result?.status).toBe("posted");
  });
});

describe("thread visibility over time", () => {
  it("a thread on a lesson that goes back to draft disappears for students and stays for the teacher", async () => {
    const room = await threadRoom();
    const { threadId, postId } = await asked(room.studentA, { lesson: room.lesson.id });
    expect(await threadIdsFor(room.studentB.client, room.classroom.id)).toEqual([threadId]);

    await setPublished(room.lesson.id, false);
    for (const student of [room.studentA, room.studentB]) {
      expect(await threadIdsFor(student.client, room.classroom.id)).toEqual([]);
      expect(await viewOf(student.client, threadId)).toEqual(notFound);
      expect((await addPost(student.client, threadId)).result).toEqual(notFound);
    }
    expect((await editPost(room.studentA.client, postId, "Changed while hidden.")).result).toEqual(notFound);
    expect(await threadIdsFor(room.teacher.client, room.classroom.id)).toEqual([threadId]);
    expect((await viewOf(room.teacher.client, threadId)).status).toBe("ok");

    await setPublished(room.lesson.id, true);
    expect(await threadIdsFor(room.studentB.client, room.classroom.id)).toEqual([threadId]);
    expect((await viewOf(room.studentA.client, threadId)).status).toBe("ok");
  });

  it("a thread on an activity that is unpublished disappears for students and stays for the teacher", async () => {
    const room = await threadRoom();
    const activity = await activityIn(room);
    const { threadId } = await asked(room.studentA, { activity: activity.id });
    expect((await viewOf(room.studentB.client, threadId)).status).toBe("ok");

    await setActivity(activity.id, { published_at: null });
    for (const student of [room.studentA, room.studentB]) {
      expect(await threadIdsFor(student.client, room.classroom.id)).toEqual([]);
      expect(await viewOf(student.client, threadId)).toEqual(notFound);
      expect((await addPost(student.client, threadId)).result).toEqual(notFound);
    }
    expect(await threadIdsFor(room.teacher.client, room.classroom.id)).toEqual([threadId]);
    expect((await viewOf(room.teacher.client, threadId)).status).toBe("ok");

    await setActivity(activity.id, { published_at: new Date().toISOString() });
    expect((await viewOf(room.studentA.client, threadId)).status).toBe("ok");
  });

  it("a removed student gets not_found everywhere", async () => {
    const room = await threadRoom();
    const leaver = room.studentB;
    const { threadId, postId } = await asked(leaver, { lesson: room.lesson.id });
    const answerId = await posted(room.studentA, threadId);
    expect((await viewOf(leaver.client, threadId)).status).toBe("ok");

    await removeFromClass(room.teacher, room.classroom.id, leaver.id);
    expect(await threadIdsFor(leaver.client, room.classroom.id)).toEqual([]);
    expect(await viewOf(leaver.client, threadId)).toEqual(notFound);
    expect((await addPost(leaver.client, threadId)).result).toEqual(notFound);
    expect((await addPost(leaver.client, threadId, answerId)).result).toEqual(notFound);
    expect((await editPost(leaver.client, postId, "Still here.")).result).toEqual(notFound);
    expect((await setPostHidden(leaver.client, postId, true)).result).toEqual(notFound);
    expect((await setThreadLocked(leaver.client, threadId, true)).result).toEqual(notFound);
    expect((await postHistory(leaver.client, postId)).rows).toEqual([]);
    expect(await readPost(postId)).toMatchObject({ body: "The restore stops at the first table.", edit_count: 0 });
    expect(await countPostsIn(threadId)).toBe(2);
  });
});

describe("class_threads", () => {
  it("returns the columns, counts replies without the question and orders by the newest visible activity", async () => {
    const room = await threadRoom();
    const activity = await activityIn(room);
    const first = await asked(room.studentA, { lesson: room.lesson.id }, "First question");
    const second = await asked(room.studentB, { activity: activity.id }, "Second question");
    const third = await asked(room.teacher, { lesson: room.lesson.id }, "Third question");
    const answerId = await posted(room.studentB, first.threadId);
    const replyId = await posted(room.teacher, first.threadId, answerId);
    const reply = (await readPost(replyId))!;

    const student = await classThreads(room.studentA.client, room.classroom.id);
    expect(student.error).toBeNull();
    expect(student.rows!.map((row) => row.thread_id)).toEqual([first.threadId, third.threadId, second.threadId]);
    for (const row of student.rows!) expect(Object.keys(row).sort()).toEqual(summaryKeys);
    expect(student.rows![0]).toEqual({
      thread_id: first.threadId,
      lesson_id: room.lesson.id,
      activity_id: null,
      target_title: room.lesson.title,
      title: "First question",
      author_name: await nameOf(room.studentA),
      author_role: "student",
      created_at: (await readThread(first.threadId))!.created_at,
      locked: false,
      replies: 2,
      last_post_at: reply.created_at,
      hidden_posts: 0,
      question_hidden: false,
    });
    expect(student.rows![1]).toMatchObject({ author_role: "teacher", author_name: await nameOf(room.teacher), replies: 0 });
    expect(student.rows![2]).toMatchObject({
      lesson_id: null,
      activity_id: activity.id,
      target_title: activity.title,
      replies: 0,
      last_post_at: (await readPost(second.postId))!.created_at,
    });

    expect((await setPostHidden(room.teacher.client, answerId, true)).result).toEqual({ status: "hidden" });
    expect((await setPostHidden(room.teacher.client, second.postId, true)).result).toEqual({ status: "hidden" });

    const afterHide = await classThreads(room.studentA.client, room.classroom.id);
    expect(afterHide.rows!.map((row) => row.thread_id)).toEqual([third.threadId, first.threadId]);
    expect(afterHide.rows![1]).toMatchObject({ replies: 0, last_post_at: (await readPost(first.postId))!.created_at });
    for (const row of afterHide.rows!) expect(row).toMatchObject({ hidden_posts: 0, question_hidden: false });

    const teacher = await classThreads(room.teacher.client, room.classroom.id);
    expect(teacher.rows!.map((row) => row.thread_id)).toEqual([first.threadId, third.threadId, second.threadId]);
    expect(teacher.rows![0]).toMatchObject({ replies: 2, last_post_at: reply.created_at, hidden_posts: 2, question_hidden: false });
    expect(teacher.rows![1]).toMatchObject({ replies: 0, hidden_posts: 0, question_hidden: false });
    expect(teacher.rows![2]).toMatchObject({ replies: 0, hidden_posts: 1, question_hidden: true });
  });

  it("returns at most 200 rows", async () => {
    const room = await threadRoom();
    await seedThreads(room.classroom.id, { lesson: room.lesson.id }, 150);
    await seedThreads(room.classroom.id, { activity: (await activityIn(room)).id }, 51);
    const newest = await asked(room.studentA, { lesson: (await lessonIn(room)).id });
    for (const client of [room.teacher.client, room.studentB.client]) {
      const { rows, error } = await classThreads(client, room.classroom.id);
      expect(error).toBeNull();
      expect(rows).toHaveLength(200);
      expect(rows![0].thread_id).toBe(newest.threadId);
    }
  });
});

describe("names on posts", () => {
  it("a student who renames after posting keeps the old name on old posts", async () => {
    const room = await threadRoom();
    const writer = room.studentB;
    const oldName = await nameOf(writer);
    const newName = "Ana Reyes";
    const { threadId, postId } = await asked(writer, { lesson: room.lesson.id });
    const answerId = await posted(writer, threadId);

    await renameSelf(writer, newName);
    const laterId = await posted(writer, threadId);

    for (const reader of [room.studentA, room.teacher, writer]) {
      const view = await viewOf(reader.client, threadId);
      const names = Object.fromEntries(view.posts!.map((post) => [post.id, post.author_name]));
      expect(names).toEqual({ [postId]: oldName, [answerId]: oldName, [laterId]: newName });
      const { rows } = await classThreads(reader.client, room.classroom.id);
      expect(rows!.find((row) => row.thread_id === threadId)!.author_name).toBe(oldName);
    }
  });

  it("a student never receives author_id, hidden, author_in_class or edit_count, and the teacher does", async () => {
    const room = await threadRoom();
    const { threadId, postId } = await asked(room.studentA, { lesson: room.lesson.id });
    const teacherPost = await posted(room.teacher, threadId);
    const replyId = await posted(room.studentB, threadId, teacherPost);

    for (const student of [room.studentA, room.studentB]) {
      const view = await viewOf(student.client, threadId);
      expect(Object.keys(view).sort()).toEqual(["posts", "status", "thread", "version"]);
      expect(Object.keys(view.thread!).sort()).toEqual([
        "activity_id",
        "can_moderate",
        "class_id",
        "id",
        "lesson_id",
        "locked",
        "target_title",
        "title",
      ]);
      expect(view.thread).toMatchObject({ can_moderate: false, id: threadId, lesson_id: room.lesson.id, activity_id: null });
      expect(view.posts).toHaveLength(3);
      for (const post of view.posts!) expect(Object.keys(post).sort()).toEqual(studentPostKeys);
      for (const actor of [room.studentA, room.studentB, room.teacher]) expect(JSON.stringify(view)).not.toContain(actor.id);
      expect(view.posts!.map((post) => [post.id, post.author_role, post.mine])).toEqual([
        [postId, "student", student === room.studentA],
        [teacherPost, "teacher", false],
        [replyId, "student", student === room.studentB],
      ]);
    }

    const view = await viewOf(room.teacher.client, threadId);
    expect(view.thread!.can_moderate).toBe(true);
    for (const post of view.posts!) expect(Object.keys(post).sort()).toEqual(teacherPostKeys);
    expect(view.posts!.map((post) => [post.id, post.author_role, post.mine, post.author_id, post.author_in_class])).toEqual([
      [postId, "student", false, room.studentA.id, true],
      [teacherPost, "teacher", true, room.teacher.id, true],
      [replyId, "student", false, room.studentB.id, true],
    ]);
    for (const post of view.posts!) expect(post).toMatchObject({ hidden: false, edit_count: 0 });
  });
});

describe("deleting around threads", () => {
  it("deleting a student account leaves the posts and the replies under them with the name", async () => {
    const room = await threadRoom();
    const leaver = room.studentB;
    const name = await nameOf(leaver);
    const { threadId, postId } = await asked(leaver, { lesson: room.lesson.id });
    const answerId = await posted(leaver, threadId);
    const underAnswer = await posted(room.studentA, threadId, answerId);
    const otherAnswer = await posted(room.studentA, threadId);
    const ownReply = await posted(leaver, threadId, otherAnswer);
    const authored = [postId, answerId, ownReply];

    await deleteAccount(leaver);

    const rows = await readPosts(threadId);
    expect(rows.map((row) => row.id).sort()).toEqual([postId, answerId, underAnswer, otherAnswer, ownReply].sort());
    for (const row of rows.filter((entry) => authored.includes(entry.id))) {
      expect(row).toMatchObject({ author_id: null, author_name: name });
    }
    expect(rows.find((row) => row.id === underAnswer)).toMatchObject({ parent_id: answerId, author_id: room.studentA.id });
    expect(await readThread(threadId)).toMatchObject({ created_by: null });

    for (const reader of [room.studentA, room.teacher]) {
      const view = await viewOf(reader.client, threadId);
      expect(view.posts).toHaveLength(5);
      for (const post of view.posts!.filter((entry) => authored.includes(entry.id))) {
        expect(post).toMatchObject({ mine: false, can_edit: false, author_name: name, author_role: "student" });
      }
    }
    const { rows: listed } = await classThreads(room.studentA.client, room.classroom.id);
    expect(listed!.find((row) => row.thread_id === threadId)).toMatchObject({ author_name: name, author_role: "student", replies: 4 });
    const teacherView = await viewOf(room.teacher.client, threadId);
    expect(teacherView.posts!.find((post) => post.id === answerId)).toMatchObject({ author_id: null, author_in_class: false });
  });

  it("a lesson or an activity with a thread cannot be deleted", async () => {
    const room = await threadRoom();
    const activity = await activityIn(room);
    const onLesson = await asked(room.studentA, { lesson: room.lesson.id });
    const onActivity = await asked(room.studentA, { activity: activity.id });

    for (const client of [room.teacher.client, admin]) {
      const lessonGone = await client.from("lessons").delete().eq("id", room.lesson.id).select("id");
      expect(lessonGone.error?.code).toBe(foreignKeyFailed);
      expect(lessonGone.error?.message).toContain("threads_lesson_id_fkey");
      const activityGone = await client.from("activities").delete().eq("id", activity.id).select("id");
      expect(activityGone.error?.code).toBe(foreignKeyFailed);
      expect(activityGone.error?.message).toContain("threads_activity_id_fkey");
    }
    const classGone = await admin.from("classes").delete().eq("id", room.classroom.id).select("id");
    expect(classGone.error?.code).toBe(foreignKeyFailed);
    const threadGone = await admin.from("threads").delete().eq("id", onLesson.threadId).select("id");
    expect(threadGone.error?.code).toBe(foreignKeyFailed);
    expect(await readThread(onLesson.threadId)).not.toBeNull();
    expect(await readThread(onActivity.threadId)).not.toBeNull();

    const emptyLesson = await lessonIn(room);
    const removed = await room.teacher.client.from("lessons").delete().eq("id", emptyLesson.id).select("id");
    expect(removed.error).toBeNull();
    expect(removed.data).toHaveLength(1);
  });
});

describe("thread table constraints", () => {
  const thread = (room: Room, change: Record<string, unknown>) =>
    admin.from("threads").insert({ class_id: room.classroom.id, title: "Constraint check", ...change } as never);
  const post = (threadId: string, change: Record<string, unknown>) =>
    admin.from("posts").insert({ thread_id: threadId, author_name: "Former classmate", body: "A body.", ...change } as never);

  it("a thread needs exactly one target, inside its own class", async () => {
    const room = await threadRoom();
    const lesson = room.lesson;
    const activity = await activityIn(room);
    expect((await thread(room, { lesson_id: lesson.id, activity_id: activity.id })).error?.code).toBe(checkFailed);
    expect((await thread(room, {})).error?.code).toBe(checkFailed);
    expect((await thread(room, { lesson_id: otherLesson.id })).error?.code).toBe(checkFailed);
    const otherActivity = await addUpload(world.otherClassroom.id, world.otherTeacher.id);
    expect((await thread(room, { activity_id: otherActivity.id })).error?.code).toBe(checkFailed);
    expect((await thread(room, { lesson_id: lesson.id, title: "" })).error?.code).toBe(checkFailed);
    expect((await thread(room, { lesson_id: lesson.id, title: "a".repeat(161) })).error?.code).toBe(checkFailed);
    expect((await thread(room, { lesson_id: lesson.id })).error).toBeNull();
    expect((await thread(room, { activity_id: activity.id })).error).toBeNull();

    const { threadId } = await seedThread(room.classroom.id, { lesson: lesson.id });
    const moved = await admin.from("threads").update({ lesson_id: otherLesson.id }).eq("id", threadId);
    expect(moved.error?.code).toBe(checkFailed);
    const both = await admin.from("threads").update({ activity_id: activity.id }).eq("id", threadId);
    expect(both.error?.code).toBe(checkFailed);
  });

  it("a reply sits one level under a top-level post of the same thread", async () => {
    const room = await threadRoom();
    const first = await seedThread(room.classroom.id, { lesson: room.lesson.id });
    const second = await seedThread(room.classroom.id, { lesson: room.lesson.id });
    const [answerId] = await seedPosts(first.threadId, [{}]);
    const [replyId] = await seedPosts(first.threadId, [{ parentId: answerId }]);
    const [elsewhere] = await seedPosts(second.threadId, [{}]);

    expect((await post(first.threadId, { parent_id: replyId })).error?.code).toBe(checkFailed);
    expect((await post(first.threadId, { parent_id: elsewhere })).error?.code).toBe(checkFailed);
    expect((await post(first.threadId, { parent_id: randomUUID() })).error?.code).toBe(checkFailed);
    expect((await post(first.threadId, { parent_id: answerId })).error).toBeNull();
    const nested = await admin.from("posts").update({ parent_id: replyId }).eq("id", elsewhere);
    expect(nested.error?.code).toBe(checkFailed);
    const strayReply = await admin.from("posts").update({ thread_id: second.threadId }).eq("id", replyId);
    expect(strayReply.error?.code).toBe(checkFailed);
  });

  it("a thread has one question, the question has no parent, and counts and names stay in range", async () => {
    const room = await threadRoom();
    const { threadId, postId } = await seedThread(room.classroom.id, { lesson: room.lesson.id });
    const [answerId] = await seedPosts(threadId, [{}]);

    expect((await post(threadId, { is_question: true })).error?.code).toBe(duplicateKey);
    const promoted = await admin.from("posts").update({ is_question: true }).eq("id", answerId);
    expect(promoted.error?.code).toBe(duplicateKey);

    const bare = await admin
      .from("threads")
      .insert({ class_id: room.classroom.id, lesson_id: room.lesson.id, title: "No question yet" })
      .select("id")
      .single();
    expect(bare.error).toBeNull();
    const [bareAnswer] = await seedPosts(bare.data!.id, [{}]);
    expect((await post(bare.data!.id, { is_question: true, parent_id: bareAnswer })).error?.code).toBe(checkFailed);

    expect((await post(threadId, { edit_count: 4 })).error?.code).toBe(checkFailed);
    expect((await post(threadId, { edit_count: -1 })).error?.code).toBe(checkFailed);
    expect((await admin.from("posts").update({ edit_count: 4 }).eq("id", postId)).error?.code).toBe(checkFailed);
    expect((await post(threadId, { author_name: "" })).error?.code).toBe(checkFailed);
    expect((await post(threadId, { author_name: "a".repeat(121) })).error?.code).toBe(checkFailed);
    expect((await post(threadId, { body: "" })).error?.code).toBe(checkFailed);
    expect((await post(threadId, { body: "a".repeat(2001) })).error?.code).toBe(checkFailed);
    expect((await post(threadId, { body: `${"- ".repeat(999)}a` })).error?.code).toBe(checkFailed);
    expect((await post(threadId, { edit_count: 3, created_at: minutesAgo(5) })).error).toBeNull();

    const event = await admin.from("post_events").insert({ post_id: postId, kind: "delete" });
    expect(event.error?.code).toBe(checkFailed);
    const orphan = await admin.from("post_events").insert({ post_id: randomUUID(), kind: "edit" });
    expect(orphan.error?.code).toBe(foreignKeyFailed);
  });
});
