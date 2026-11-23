import { randomUUID } from "node:crypto";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import {
  addDeck,
  addLesson,
  asked,
  createAnonClient,
  createRouteWorld,
  editPost,
  notFound,
  posted,
  readProfile,
  removeCreatedUsers,
  removeFromClass,
  setPostHidden,
  setPublished,
  setThreadLocked,
  testPassword,
  threadRoom,
  threadView,
  type Actor,
  type Client,
} from "./helpers";

type Message = Record<string, unknown>;
type Listener = { client: Client; channel: RealtimeChannel; status: string; reason: string; messages: Message[] };

const socketTimeout = 10_000;
const lookTimeout = 3000;
const quietMilliseconds = 1500;
const testTimeout = 40_000;
const listeners: Listener[] = [];
const sockets: Client[] = [];

let world: Awaited<ReturnType<typeof createRouteWorld>>;

function topicOf(threadId: string): string {
  return `thread:${threadId}`;
}

function quiet(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, quietMilliseconds));
}

async function ownSocket(actor: Actor | null): Promise<Client> {
  const client = createAnonClient();
  sockets.push(client);
  if (!actor) return client;
  const { error } = await client.auth.signInWithPassword({ email: actor.email, password: testPassword });
  if (error) throw error;
  return client;
}

async function listen(actor: Actor | null, topic: string, isPrivate = true): Promise<Listener> {
  const client = await ownSocket(actor);
  const channel = client.channel(topic, { config: { private: isPrivate } });
  const listener: Listener = { client, channel, status: "", reason: "", messages: [] };
  listeners.push(listener);
  channel.on("broadcast", { event: "*" }, (message) => {
    listener.messages.push(message);
  });
  await new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, socketTimeout);
    channel.subscribe((status, error) => {
      if (listener.status) return;
      listener.status = status;
      listener.reason = error?.message ?? "";
      clearTimeout(timer);
      resolve();
    });
  });
  return listener;
}

async function joined(actor: Actor, topic: string): Promise<Listener> {
  const listener = await listen(actor, topic);
  expect(listener.status).toBe("SUBSCRIBED");
  return listener;
}

async function refusedJoin(actor: Actor | null, topic: string): Promise<Listener> {
  const listener = await listen(actor, topic);
  expect(listener.status).toBe("CHANNEL_ERROR");
  return listener;
}

function reasonWithoutTopic(listener: Listener): string {
  return listener.reason.replace(listener.channel.subTopic, "");
}

async function receivesLooks(listener: Listener, count: number) {
  await vi.waitFor(() => expect(listener.messages.length).toBeGreaterThanOrEqual(count), { timeout: lookTimeout, interval: 25 });
  expect(listener.messages).toHaveLength(count);
}

function expectEmptyLook(message: Message) {
  expect(message.event).toBe("look");
  expect(message.type).toBe("broadcast");
  const { id, ...rest } = message.payload as Record<string, unknown>;
  expect(id).toEqual(expect.any(String));
  expect(rest).toEqual({});
}

beforeAll(async () => {
  world = await createRouteWorld();
});

afterEach(async () => {
  await Promise.all(listeners.splice(0).map((listener) => listener.client.removeChannel(listener.channel)));
  for (const client of sockets.splice(0)) client.realtime.disconnect();
});

afterAll(removeCreatedUsers);

describe("thread channel look events", () => {
  it(
    "thread channel: an enrolled student and the class teacher receive an empty look after a post, an edit, a hide and a lock",
    async () => {
      const room = await threadRoom();
      const { threadId, postId } = await asked(room.studentA, { lesson: room.lesson.id });
      const teacher = await joined(room.teacher, topicOf(threadId));
      const student = await joined(room.studentA, topicOf(threadId));
      const both = [teacher, student];
      let answerId = "";

      const changes = [
        async () => {
          answerId = await posted(room.studentB, threadId, null, "Words that stay in the database.");
        },
        async () => {
          expect((await editPost(room.studentB.client, answerId, "Edited words that stay in the database.")).result).toEqual({
            status: "edited",
          });
        },
        async () => {
          expect((await setPostHidden(room.teacher.client, answerId, true)).result).toEqual({ status: "hidden" });
        },
        async () => {
          expect((await setThreadLocked(room.teacher.client, threadId, true)).result).toEqual({ status: "locked" });
        },
      ];
      for (const [index, change] of changes.entries()) {
        await change();
        await Promise.all(both.map((listener) => receivesLooks(listener, index + 1)));
      }

      const writerName = (await readProfile(room.studentB.id)).full_name;
      for (const listener of both) {
        expect(listener.messages).toHaveLength(changes.length);
        for (const message of listener.messages) expectEmptyLook(message);
        const everything = JSON.stringify(listener.messages);
        for (const secret of [answerId, postId, threadId, room.studentB.id, room.teacher.id, writerName, "Words", "body", "author"]) {
          expect(everything).not.toContain(secret);
        }
      }
    },
    testTimeout,
  );

  it(
    "thread channel: a refused call sends no look",
    async () => {
      const room = await threadRoom();
      const { threadId, postId } = await asked(room.studentA, { lesson: room.lesson.id });
      const student = await joined(room.studentB, topicOf(threadId));

      expect((await editPost(room.studentA.client, postId, "The restore stops at the first table.")).result).toEqual({
        status: "unchanged",
      });
      expect((await editPost(room.studentB.client, postId, "Not mine.")).result).toEqual(notFound);
      expect((await setPostHidden(room.studentB.client, postId, true)).result).toEqual(notFound);
      expect((await setThreadLocked(room.studentB.client, threadId, true)).result).toEqual(notFound);
      await quiet();
      expect(student.messages).toEqual([]);
    },
    testTimeout,
  );
});

describe("thread channel joins", () => {
  it(
    "thread channel: people who cannot read the thread get CHANNEL_ERROR with the same text as a random thread",
    async () => {
      const room = await threadRoom();
      const gone = await threadRoom();
      const open = await asked(room.studentA, { lesson: room.lesson.id });
      const concealed = await asked(room.studentA, { lesson: room.lesson.id });
      const draftLesson = await addLesson(room.moduleId, "Point in time recovery", true);
      const onDraft = await asked(room.studentA, { lesson: draftLesson.id });
      const left = await asked(gone.studentA, { lesson: gone.lesson.id });
      await setPublished(draftLesson.id, false);
      expect((await setPostHidden(room.teacher.client, concealed.postId, true)).result).toEqual({ status: "hidden" });
      await removeFromClass(gone.teacher, gone.classroom.id, gone.studentB.id);

      const member = await joined(room.studentB, topicOf(open.threadId));
      const teacherOnHidden = await joined(room.teacher, topicOf(concealed.threadId));
      const teacherOnDraft = await joined(room.teacher, topicOf(onDraft.threadId));
      const random = await refusedJoin(room.studentA, topicOf(randomUUID()));
      expect(random.reason).toContain(random.channel.subTopic);

      const attempts: [Actor | null, string][] = [
        [world.otherStudent, open.threadId],
        [world.otherTeacher, open.threadId],
        [world.outsider, open.threadId],
        [null, open.threadId],
        [gone.studentB, left.threadId],
        [room.studentA, concealed.threadId],
        [room.studentB, concealed.threadId],
        [room.studentA, onDraft.threadId],
        [room.teacher, randomUUID()],
        [null, randomUUID()],
      ];
      const refusedListeners = await Promise.all(attempts.map(([actor, threadId]) => refusedJoin(actor, topicOf(threadId))));
      for (const listener of refusedListeners) expect(reasonWithoutTopic(listener)).toBe(reasonWithoutTopic(random));

      await posted(room.studentA, open.threadId);
      await posted(room.teacher, concealed.threadId);
      await posted(room.teacher, onDraft.threadId);
      await posted(gone.studentA, left.threadId);
      await receivesLooks(member, 1);
      await receivesLooks(teacherOnHidden, 1);
      await receivesLooks(teacherOnDraft, 1);
      await quiet();
      for (const listener of [random, ...refusedListeners]) expect(listener.messages).toEqual([]);
    },
    testTimeout,
  );

  it(
    "thread channel: topics that are not thread:<uuid> are refused, and thread and live topics do not open each other",
    async () => {
      const room = await threadRoom();
      const { threadId } = await asked(room.studentA, { lesson: room.lesson.id });
      const deck = await addDeck(room.classroom.id, room.teacher.id, { slideCount: 5 });
      const random = await refusedJoin(room.studentA, topicOf(randomUUID()));

      const topics = [
        "thread:",
        "thread:not-a-uuid",
        `thread:${threadId}x`,
        `thread:${threadId.toUpperCase()}`,
        `threads:${threadId}`,
        `look:${threadId}`,
        `thread:${deck.id}`,
        `live:${threadId}`,
        `thread:${room.classroom.id}`,
        `thread:${room.lesson.id}`,
      ];
      const refusedListeners = await Promise.all(
        [room.studentA, room.teacher].flatMap((actor) => topics.map((topic) => refusedJoin(actor, topic))),
      );
      for (const listener of refusedListeners) expect(reasonWithoutTopic(listener)).toBe(reasonWithoutTopic(random));

      const onDeck = await listen(room.studentA, `live:${deck.id}`);
      expect(onDeck.status).toBe("SUBSCRIBED");
      const onThread = await joined(room.studentA, topicOf(threadId));
      await posted(room.studentB, threadId);
      await receivesLooks(onThread, 1);
      await quiet();
      expect(onDeck.messages).toEqual([]);
      for (const listener of refusedListeners) expect(listener.messages).toEqual([]);
    },
    testTimeout,
  );
});

describe("thread channel publishing", () => {
  it(
    "thread channel: a class member cannot publish, and neither can the teacher",
    async () => {
      const room = await threadRoom();
      const { threadId } = await asked(room.studentA, { lesson: room.lesson.id });
      const teacher = await joined(room.teacher, topicOf(threadId));
      const student = await joined(room.studentA, topicOf(threadId));
      const classmate = await joined(room.studentB, topicOf(threadId));
      const everyone = [teacher, student, classmate];

      await student.channel.send({ type: "broadcast", event: "look", payload: {} });
      await student.channel.send({ type: "broadcast", event: "look", payload: { body: "forged" } });
      await classmate.channel.send({ type: "broadcast", event: "note", payload: { text: "hello" } });
      await teacher.channel.send({ type: "broadcast", event: "look", payload: { body: "forged" } });
      await quiet();
      for (const listener of everyone) expect(listener.messages).toEqual([]);

      await posted(room.studentB, threadId);
      for (const listener of everyone) await receivesLooks(listener, 1);
      for (const listener of everyone) expectEmptyLook(listener.messages[0]);
    },
    testTimeout,
  );

  it(
    "thread channel: a public channel with the same name receives nothing when a post is made and reaches no private subscriber",
    async () => {
      const room = await threadRoom();
      const { threadId } = await asked(room.studentA, { lesson: room.lesson.id });
      const teacher = await joined(room.teacher, topicOf(threadId));
      const student = await joined(room.studentA, topicOf(threadId));
      const publicListeners = [
        await listen(world.outsider, topicOf(threadId), false),
        await listen(null, topicOf(threadId), false),
        await listen(room.studentB, topicOf(threadId), false),
      ];
      const statuses = publicListeners.map((listener) => listener.status);
      expect(statuses.every((status) => status === "SUBSCRIBED" || status === "CHANNEL_ERROR")).toBe(true);

      await posted(room.studentB, threadId);
      await receivesLooks(teacher, 1);
      await receivesLooks(student, 1);
      await quiet();
      for (const listener of publicListeners) expect(listener.messages).toEqual([]);

      const forged = { body: "forged" };
      for (const listener of publicListeners) await listener.channel.send({ type: "broadcast", event: "look", payload: forged });
      if (statuses.every((status) => status === "SUBSCRIBED")) {
        await vi.waitFor(() => expect(publicListeners[1].messages.map((message) => message.payload)).toContainEqual(forged), {
          timeout: socketTimeout,
          interval: 50,
        });
      }
      await quiet();
      for (const listener of [teacher, student]) {
        expect(listener.messages).toHaveLength(1);
        expectEmptyLook(listener.messages[0]);
      }
    },
    testTimeout,
  );
});

describe("thread channel roster changes", () => {
  it(
    "thread channel: a removed student gets not_found from thread_view at once while the socket is still subscribed",
    async () => {
      const room = await threadRoom();
      const { threadId } = await asked(room.studentA, { lesson: room.lesson.id });
      const student = await joined(room.studentB, topicOf(threadId));
      await posted(room.studentA, threadId);
      await receivesLooks(student, 1);
      expect((await threadView(student.client, threadId)).view?.status).toBe("ok");

      await removeFromClass(room.teacher, room.classroom.id, room.studentB.id);
      expect(student.channel.state).toBe("joined");
      const { view, error } = await threadView(student.client, threadId);
      expect(error).toBeNull();
      expect(view).toEqual(notFound);
      expect((await threadView(student.client, threadId, 2)).view).toEqual(notFound);
      const again = await refusedJoin(room.studentB, topicOf(threadId));
      expect(again.messages).toEqual([]);
    },
    testTimeout,
  );
});
