import { afterAll, describe, expect, it } from "vitest";
import {
  addPost,
  askQuestion,
  asked,
  countPostsBy,
  countPostsIn,
  countThreadsBy,
  enroll,
  minutesAgo,
  posted,
  readPosts,
  readThread,
  removeCreatedUsers,
  secondsAgo,
  seedPosts,
  seedThread,
  seedThreads,
  setPostCreatedAt,
  setPostHidden,
  threadRoom,
  type Actor,
} from "./helpers";

type Room = Awaited<ReturnType<typeof threadRoom>>;

const slowDown = { status: "slow_down" };
const limitReached = { status: "limit_reached" };
const full = { status: "full" };

async function olderPosts(room: Room, author: Actor, count: number, minutes: number) {
  const archive = await seedThread(room.classroom.id, { lesson: room.lesson.id });
  await seedPosts(
    archive.threadId,
    Array.from({ length: count }, () => ({ authorId: author.id, authorName: "Earlier self", createdAt: minutesAgo(minutes) })),
  );
}

async function olderThreads(room: Room, author: Actor, count: number, minutes: number) {
  await seedThreads(room.classroom.id, { lesson: room.lesson.id }, count, {
    createdBy: author.id,
    authorName: "Earlier self",
    createdAt: minutesAgo(minutes),
  });
}

async function written(room: Room, actor: Actor, threadId: string) {
  return {
    posts: await countPostsBy(actor.id),
    threads: await countThreadsBy(actor.id),
    inThread: await countPostsIn(threadId),
    version: (await readThread(threadId))!.version,
    classThreads: await countThreadsBy(room.teacher.id),
  };
}

afterAll(removeCreatedUsers);

describe("posts per minute", () => {
  it("the sixth post inside one minute is rejected", async () => {
    const room = await threadRoom();
    const { threadId } = await asked(room.studentA, { lesson: room.lesson.id });
    const postIds: string[] = [];
    for (let turn = 1; turn <= 5; turn += 1) {
      const { result, error } = await addPost(room.studentB.client, threadId, null, `Answer ${turn}`);
      expect(error).toBeNull();
      expect(result).toEqual({ status: "posted", post_id: expect.any(String) });
      postIds.push(result!.post_id!);
    }
    const before = await written(room, room.studentB, threadId);
    expect(before).toMatchObject({ posts: 5, inThread: 6, version: 6 });

    const sixth = await addPost(room.studentB.client, threadId, null, "Answer 6");
    expect(sixth.error).toBeNull();
    expect(sixth.result).toEqual(slowDown);
    expect((await addPost(room.studentB.client, threadId, postIds[0], "Reply 6")).result).toEqual(slowDown);
    expect(await written(room, room.studentB, threadId)).toEqual(before);

    await setPostCreatedAt(postIds, secondsAgo(61));
    const later = await addPost(room.studentB.client, threadId, null, "Answer after a minute");
    expect(later.result).toEqual({ status: "posted", post_id: expect.any(String) });
    expect(await countPostsBy(room.studentB.id)).toBe(6);
  });

  it("ten posts fired at once never leave more than five rows in the minute", async () => {
    const room = await threadRoom();
    const { threadId } = await asked(room.studentA, { lesson: room.lesson.id });
    const answers = await Promise.all(
      Array.from({ length: 10 }, (_, index) => addPost(room.studentB.client, threadId, null, `Burst ${index}`)),
    );
    for (const answer of answers) {
      expect(answer.error).toBeNull();
      expect(["posted", "slow_down"]).toContain(answer.result!.status);
    }
    const accepted = answers.filter((answer) => answer.result!.status === "posted").length;
    expect(accepted).toBeGreaterThanOrEqual(1);
    expect(accepted).toBeLessThanOrEqual(5);
    expect(await countPostsBy(room.studentB.id)).toBe(accepted);
    expect(await countPostsIn(threadId)).toBe(1 + accepted);

    for (let turn = accepted; turn < 5; turn += 1) await posted(room.studentB, threadId);
    expect((await addPost(room.studentB.client, threadId)).result).toEqual(slowDown);
    expect(await countPostsBy(room.studentB.id)).toBe(5);
  });

  it("a new question counts as a post, and a refused question writes nothing", async () => {
    const room = await threadRoom();
    const target = { lesson: room.lesson.id };
    const first = await asked(room.studentA, target);
    await asked(room.studentA, target);
    for (let turn = 0; turn < 3; turn += 1) await posted(room.studentA, first.threadId);
    const before = await written(room, room.studentA, first.threadId);
    expect(before).toMatchObject({ posts: 5, threads: 2 });

    expect((await addPost(room.studentA.client, first.threadId)).result).toEqual(slowDown);
    expect((await askQuestion(room.studentA.client, target)).result).toEqual(slowDown);
    expect(await written(room, room.studentA, first.threadId)).toEqual(before);
  });

  it("posts in different threads and classes count together, and a hidden post still counts", async () => {
    const room = await threadRoom();
    const second = await threadRoom();
    await enroll(second.classroom.id, room.studentB.id);
    const here = await asked(room.studentA, { lesson: room.lesson.id });
    const alsoHere = await asked(room.studentA, { lesson: room.lesson.id });
    const there = await asked(second.studentA, { lesson: second.lesson.id });

    const hiddenId = await posted(room.studentB, here.threadId);
    await posted(room.studentB, here.threadId);
    await posted(room.studentB, alsoHere.threadId);
    await posted(room.studentB, there.threadId);
    await posted(room.studentB, there.threadId);
    expect((await setPostHidden(room.teacher.client, hiddenId, true)).result).toEqual({ status: "hidden" });

    for (const threadId of [here.threadId, alsoHere.threadId, there.threadId]) {
      expect((await addPost(room.studentB.client, threadId)).result).toEqual(slowDown);
    }
    expect((await askQuestion(room.studentB.client, { lesson: second.lesson.id })).result).toEqual(slowDown);
    expect(await countPostsBy(room.studentB.id)).toBe(5);
    expect(await countThreadsBy(room.studentB.id)).toBe(0);
    expect((await addPost(second.studentB.client, there.threadId)).result?.status).toBe("posted");
  });

  it("a teacher gets the same five a minute", async () => {
    const room = await threadRoom();
    const { threadId } = await asked(room.studentA, { lesson: room.lesson.id });
    for (let turn = 0; turn < 5; turn += 1) await posted(room.teacher, threadId);
    expect((await addPost(room.teacher.client, threadId)).result).toEqual(slowDown);
    expect(await countPostsBy(room.teacher.id)).toBe(5);
  });
});

describe("posts per hour and per day", () => {
  it("the 21st post in an hour answers limit_reached for a student", async () => {
    const room = await threadRoom();
    const { threadId } = await asked(room.studentA, { lesson: room.lesson.id });
    await olderPosts(room, room.studentB, 19, 30);
    expect((await addPost(room.studentB.client, threadId)).result?.status).toBe("posted");
    const before = await written(room, room.studentB, threadId);
    expect(before.posts).toBe(20);

    expect((await addPost(room.studentB.client, threadId)).result).toEqual(limitReached);
    expect((await askQuestion(room.studentB.client, { lesson: room.lesson.id })).result).toEqual(limitReached);
    expect(await written(room, room.studentB, threadId)).toEqual(before);
  });

  it("posts older than an hour do not count toward the hour", async () => {
    const room = await threadRoom();
    const { threadId } = await asked(room.studentA, { lesson: room.lesson.id });
    await olderPosts(room, room.studentB, 19, 30);
    await olderPosts(room, room.studentB, 30, 61);
    expect((await addPost(room.studentB.client, threadId)).result?.status).toBe("posted");
    expect((await addPost(room.studentB.client, threadId)).result).toEqual(limitReached);
  });

  it("the 61st post in a day answers limit_reached for a student", async () => {
    const room = await threadRoom();
    const { threadId } = await asked(room.studentA, { lesson: room.lesson.id });
    await olderPosts(room, room.studentB, 40, 23 * 60);
    await olderPosts(room, room.studentB, 19, 2 * 60);
    await olderPosts(room, room.studentB, 30, 24 * 60 + 5);
    expect((await addPost(room.studentB.client, threadId)).result?.status).toBe("posted");
    const before = await written(room, room.studentB, threadId);
    expect(before.posts).toBe(90);

    expect((await addPost(room.studentB.client, threadId)).result).toEqual(limitReached);
    expect((await askQuestion(room.studentB.client, { lesson: room.lesson.id })).result).toEqual(limitReached);
    expect(await written(room, room.studentB, threadId)).toEqual(before);
  });

  it("a teacher is allowed 60 an hour and 180 a day", async () => {
    const room = await threadRoom();
    const { threadId } = await asked(room.studentA, { lesson: room.lesson.id });
    await olderPosts(room, room.teacher, 59, 30);
    expect((await addPost(room.teacher.client, threadId)).result?.status).toBe("posted");
    expect((await addPost(room.teacher.client, threadId)).result).toEqual(limitReached);
    expect(await countPostsBy(room.teacher.id)).toBe(60);

    const daily = await threadRoom();
    const dailyThread = await asked(daily.studentA, { lesson: daily.lesson.id });
    await olderPosts(daily, daily.teacher, 179, 2 * 60);
    expect((await addPost(daily.teacher.client, dailyThread.threadId)).result?.status).toBe("posted");
    expect((await addPost(daily.teacher.client, dailyThread.threadId)).result).toEqual(limitReached);
    expect(await countPostsBy(daily.teacher.id)).toBe(180);
  });
});

describe("new threads per hour and per day", () => {
  it("the 4th thread in an hour answers limit_reached for a student, who can still answer", async () => {
    const room = await threadRoom();
    const target = { lesson: room.lesson.id };
    await olderThreads(room, room.studentA, 2, 30);
    await olderThreads(room, room.studentA, 2, 61);
    const third = await asked(room.studentA, target);
    const before = await written(room, room.studentA, third.threadId);
    expect(before.threads).toBe(5);

    expect((await askQuestion(room.studentA.client, target)).result).toEqual(limitReached);
    expect(await written(room, room.studentA, third.threadId)).toEqual(before);
    expect((await addPost(room.studentA.client, third.threadId)).result?.status).toBe("posted");
  });

  it("the 7th thread in a day answers limit_reached for a student", async () => {
    const room = await threadRoom();
    const target = { lesson: room.lesson.id };
    await olderThreads(room, room.studentA, 5, 2 * 60);
    await olderThreads(room, room.studentA, 4, 24 * 60 + 5);
    const sixth = await asked(room.studentA, target);
    const before = await written(room, room.studentA, sixth.threadId);
    expect(before.threads).toBe(10);

    expect((await askQuestion(room.studentA.client, target)).result).toEqual(limitReached);
    expect(await written(room, room.studentA, sixth.threadId)).toEqual(before);
  });

  it("a teacher is allowed 9 threads an hour", async () => {
    const room = await threadRoom();
    const target = { lesson: room.lesson.id };
    await olderThreads(room, room.teacher, 8, 30);
    expect((await askQuestion(room.teacher.client, target)).result?.status).toBe("asked");
    expect((await askQuestion(room.teacher.client, target)).result).toEqual(limitReached);
    expect(await countThreadsBy(room.teacher.id)).toBe(9);
  });
});

describe("posts per thread", () => {
  it("the 201st post in a thread answers full", async () => {
    const room = await threadRoom();
    const { threadId, postId } = await asked(room.studentA, { lesson: room.lesson.id });
    const [topId] = await seedPosts(threadId, Array.from({ length: 198 }, () => ({})));
    expect(await countPostsIn(threadId)).toBe(199);
    expect((await addPost(room.studentB.client, threadId)).result?.status).toBe("posted");
    const version = (await readThread(threadId))!.version;

    for (const actor of [room.studentA, room.studentB, room.teacher]) {
      expect((await addPost(actor.client, threadId)).result).toEqual(full);
      expect((await addPost(actor.client, threadId, topId)).result).toEqual(full);
    }
    expect(await countPostsIn(threadId)).toBe(200);
    expect((await readThread(threadId))!.version).toBe(version);
    expect((await readPosts(threadId)).filter((row) => row.is_question).map((row) => row.id)).toEqual([postId]);

    const other = await asked(room.studentA, { lesson: room.lesson.id });
    expect((await addPost(room.studentB.client, other.threadId)).result?.status).toBe("posted");
  });
});
