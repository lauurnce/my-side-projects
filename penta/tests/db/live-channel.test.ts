import { randomUUID } from "node:crypto";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import {
  addDeck,
  addLesson,
  addModule,
  admin,
  createAnonClient,
  createClass,
  createRouteWorld,
  enroll,
  liveState,
  moveLive,
  noLiveState,
  readSession,
  removeCreatedUsers,
  startedSession,
  testPassword,
  type Actor,
  type Client,
} from "./helpers";

type Message = { event: string; payload: unknown };
type ListenOptions = { isPrivate?: boolean; presenceKey?: string; readsPresence?: boolean };
type Listener = {
  client: Client;
  channel: RealtimeChannel;
  status: string;
  reason: string;
  messages: Message[];
  presenceEvents: number;
};

const socketTimeout = 10_000;
const quietMilliseconds = 1500;
const testTimeout = 40_000;
const listeners: Listener[] = [];
const sockets: Client[] = [];

let world: Awaited<ReturnType<typeof createRouteWorld>>;
let shared: Awaited<ReturnType<typeof addModule>>;

function topicOf(deckId: string): string {
  return `live:${deckId}`;
}

function readyDeck() {
  return addDeck(world.classroom.id, world.teacher.id, { slideCount: 5 });
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

async function listen(actor: Actor | null, topic: string, options: ListenOptions = {}): Promise<Listener> {
  const client = await ownSocket(actor);
  const presence = options.presenceKey ? { presence: { key: options.presenceKey } } : {};
  const channel = client.channel(topic, { config: { private: options.isPrivate ?? true, ...presence } });
  const listener: Listener = { client, channel, status: "", reason: "", messages: [], presenceEvents: 0 };
  listeners.push(listener);
  channel.on("broadcast", { event: "*" }, ({ event, payload }) => {
    listener.messages.push({ event, payload });
  });
  if (options.readsPresence) {
    for (const event of ["sync", "join", "leave"] as const) {
      channel.on("presence", { event } as never, () => {
        listener.presenceEvents += 1;
      });
    }
  }
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

async function refusedJoin(actor: Actor | null, topic: string): Promise<Listener> {
  const listener = await listen(actor, topic);
  expect(listener.status).toBe("CHANNEL_ERROR");
  return listener;
}

async function joined(actor: Actor, deckId: string, options: ListenOptions = {}): Promise<Listener> {
  const listener = await listen(actor, topicOf(deckId), options);
  expect(listener.status).toBe("SUBSCRIBED");
  return listener;
}

function withoutMessageId(payload: unknown) {
  const { id, ...rest } = payload as Record<string, unknown>;
  expect(id).toEqual(expect.any(String));
  return rest;
}

function looks(listener: Listener) {
  return listener.messages.filter((message) => message.event === "look").map((message) => withoutMessageId(message.payload));
}

async function receives(listener: Listener, look: { session_id: string; revision: number; ended: boolean }) {
  await vi.waitFor(() => expect(looks(listener)).toContainEqual(look), { timeout: socketTimeout, interval: 50 });
}

async function revisionOf(sessionId: string): Promise<number> {
  const row = await readSession(sessionId);
  if (!row) throw new Error("the session row is missing");
  return row.revision;
}

beforeAll(async () => {
  world = await createRouteWorld();
  shared = await addModule(world.classroom.id, "Week 1");
});

afterEach(async () => {
  await Promise.all(listeners.splice(0).map((listener) => listener.client.removeChannel(listener.channel)));
  for (const client of sockets.splice(0)) client.realtime.disconnect();
});

afterAll(removeCreatedUsers);

describe("live channel look events", () => {
  it(
    "live channel: the teacher and an enrolled student receive look on start, move and end, with no slide number",
    async () => {
      const deck = await readyDeck();
      const teacher = await joined(world.teacher, deck.id);
      const student = await joined(world.studentA, deck.id);

      const sessionId = await startedSession(world.teacher.client, deck.id, 2);
      const started = { session_id: sessionId, revision: await revisionOf(sessionId), ended: false };
      await receives(teacher, started);
      await receives(student, started);

      const move = await moveLive(world.teacher.client, sessionId, 4);
      expect(move.result!.revision).toBeGreaterThan(started.revision);
      const moved = { session_id: sessionId, revision: move.result!.revision!, ended: false };
      await receives(teacher, moved);
      await receives(student, moved);

      expect((await world.teacher.client.rpc("end_live", { target_session: sessionId })).data).toBe("ended");
      const ended = { session_id: sessionId, revision: await revisionOf(sessionId), ended: true };
      expect(ended.revision).toBeGreaterThan(moved.revision);
      await receives(teacher, ended);
      await receives(student, ended);

      for (const listener of [teacher, student]) {
        expect(listener.messages).toHaveLength(3);
        expect(looks(listener)).toEqual([started, moved, ended]);
        expect(JSON.stringify(listener.messages)).not.toContain("slide");
      }
    },
    testTimeout,
  );

  it(
    "live channel: touch_live and a resumed start send no event",
    async () => {
      const deck = await readyDeck();
      const teacher = await joined(world.teacher, deck.id);
      const student = await joined(world.studentA, deck.id);
      const sessionId = await startedSession(world.teacher.client, deck.id);
      const started = { session_id: sessionId, revision: await revisionOf(sessionId), ended: false };
      await receives(teacher, started);
      await receives(student, started);

      expect((await world.teacher.client.rpc("touch_live", { target_session: sessionId })).data).toBe("open");
      expect((await world.teacher.client.rpc("start_live", { target_deck: deck.id, slide: 3 })).data).toMatchObject({ status: "resumed" });
      expect((await moveLive(world.teacher.client, sessionId, 99)).result?.status).toBe("bad_slide");
      await quiet();
      expect(teacher.messages).toHaveLength(1);
      expect(student.messages).toHaveLength(1);
    },
    testTimeout,
  );
});

describe("live channel joins", () => {
  it(
    "live channel: a student of another class, another teacher, the outsider and an anonymous client are refused and receive nothing",
    async () => {
      const deck = await readyDeck();
      const teacher = await joined(world.teacher, deck.id);
      const strangers = [world.otherStudent, world.otherTeacher, world.outsider, null];
      const refusedListeners = await Promise.all(strangers.map((actor) => refusedJoin(actor, topicOf(deck.id))));

      const sessionId = await startedSession(world.teacher.client, deck.id);
      const move = await moveLive(world.teacher.client, sessionId, 3);
      await receives(teacher, { session_id: sessionId, revision: move.result!.revision!, ended: false });
      await quiet();
      for (const listener of refusedListeners) expect(listener.messages).toEqual([]);
    },
    testTimeout,
  );

  it(
    "live channel: a student cannot join the channel of a deck linked to a draft lesson",
    async () => {
      const lesson = await addLesson(shared.id, `Lesson ${randomUUID().slice(0, 8)}`);
      const deck = await addDeck(world.classroom.id, world.teacher.id, { lessonId: lesson.id });
      const [student, teacher] = await Promise.all([
        refusedJoin(world.studentA, topicOf(deck.id)),
        joined(world.teacher, deck.id),
      ]);
      const sessionId = await startedSession(world.teacher.client, deck.id);
      await receives(teacher, { session_id: sessionId, revision: await revisionOf(sessionId), ended: false });
      await quiet();
      expect(student.messages).toEqual([]);
    },
    testTimeout,
  );

  it(
    "live channel: a topic that is not live:<uuid> is refused with the same plain CHANNEL_ERROR as a foreign deck",
    async () => {
      const deck = await readyDeck();
      const teacherTopics = ["live:not-a-uuid", "live:", `live:${deck.id}x`, `live:${deck.id.toUpperCase()}`, `look:${deck.id}`];
      const studentTopics = ["live:not-a-uuid", "live:"];
      const [foreign, ...refusedListeners] = await Promise.all([
        refusedJoin(world.outsider, topicOf(deck.id)),
        ...teacherTopics.map((topic) => refusedJoin(world.teacher, topic)),
        ...studentTopics.map((topic) => refusedJoin(world.studentA, topic)),
      ]);
      expect(foreign.reason).toContain(topicOf(deck.id));
      expect(refusedListeners).toHaveLength(teacherTopics.length + studentTopics.length);
      for (const listener of refusedListeners) {
        expect(listener.reason.replace(listener.channel.subTopic, "")).toBe(foreign.reason.replace(topicOf(deck.id), ""));
      }
      await quiet();
      for (const listener of refusedListeners) expect(listener.messages).toEqual([]);
    },
    testTimeout,
  );
});

describe("live channel publishing", () => {
  it(
    "live channel: a student who can read the deck cannot publish, and neither can the teacher",
    async () => {
      const deck = await readyDeck();
      const teacher = await joined(world.teacher, deck.id);
      const student = await joined(world.studentA, deck.id);
      const classmate = await joined(world.studentB, deck.id);
      const sessionId = await startedSession(world.teacher.client, deck.id);
      const started = { session_id: sessionId, revision: await revisionOf(sessionId), ended: false };
      for (const listener of [teacher, student, classmate]) await receives(listener, started);

      const forged = { session_id: sessionId, revision: started.revision + 1_000_000, ended: true };
      await student.channel.send({ type: "broadcast", event: "look", payload: forged });
      await student.channel.send({ type: "broadcast", event: "note", payload: { text: "hello" } });
      await teacher.channel.send({ type: "broadcast", event: "look", payload: forged });
      await quiet();
      for (const listener of [teacher, student, classmate]) expect(looks(listener)).toEqual([started]);
      for (const listener of [teacher, student, classmate]) expect(listener.messages).toHaveLength(1);

      const move = await moveLive(world.teacher.client, sessionId, 2);
      const moved = { session_id: sessionId, revision: move.result!.revision!, ended: false };
      for (const listener of [teacher, student, classmate]) await receives(listener, moved);
      for (const listener of [teacher, student, classmate]) expect(looks(listener)).toEqual([started, moved]);
    },
    testTimeout,
  );

  it(
    "live channel: a public channel with the same topic receives nothing and reaches no private subscriber",
    async () => {
      const deck = await readyDeck();
      const teacher = await joined(world.teacher, deck.id);
      const student = await joined(world.studentA, deck.id);
      const signedIn = await listen(world.outsider, topicOf(deck.id), { isPrivate: false });
      const anonymous = await listen(null, topicOf(deck.id), { isPrivate: false });
      const enrolledPublic = await listen(world.studentB, topicOf(deck.id), { isPrivate: false });
      const publicStatuses = [signedIn, anonymous, enrolledPublic].map((listener) => listener.status);
      expect(publicStatuses.every((status) => status === "SUBSCRIBED" || status === "CHANNEL_ERROR")).toBe(true);

      const sessionId = await startedSession(world.teacher.client, deck.id);
      const move = await moveLive(world.teacher.client, sessionId, 3);
      const moved = { session_id: sessionId, revision: move.result!.revision!, ended: false };
      await receives(teacher, moved);
      await receives(student, moved);
      await quiet();
      for (const listener of [signedIn, anonymous, enrolledPublic]) expect(listener.messages).toEqual([]);

      const forged = { session_id: sessionId, revision: moved.revision + 1_000_000, ended: true };
      await signedIn.channel.send({ type: "broadcast", event: "look", payload: forged });
      await anonymous.channel.send({ type: "broadcast", event: "look", payload: forged });
      await enrolledPublic.channel.send({ type: "broadcast", event: "look", payload: forged });
      if (publicStatuses.every((status) => status === "SUBSCRIBED")) {
        await vi.waitFor(() => expect(anonymous.messages).toContainEqual({ event: "look", payload: forged }), {
          timeout: socketTimeout,
          interval: 50,
        });
      }
      await quiet();
      for (const listener of [teacher, student]) {
        expect(listener.messages).toHaveLength(2);
        expect(looks(listener)).not.toContainEqual(forged);
      }
    },
    testTimeout,
  );
});

describe("live channel presence", () => {
  it(
    "live channel: the teacher sees one presence key after a student tracks and a second student sees nothing",
    async () => {
      const deck = await readyDeck();
      const teacher = await joined(world.teacher, deck.id, { presenceKey: world.teacher.id, readsPresence: true });
      const watcher = await joined(world.studentB, deck.id, { presenceKey: world.studentB.id, readsPresence: true });
      const student = await joined(world.studentA, deck.id, { presenceKey: world.studentA.id });

      await student.channel.track({ following: true });
      await vi.waitFor(() => expect(Object.keys(teacher.channel.presenceState())).toEqual([world.studentA.id]), {
        timeout: socketTimeout,
        interval: 50,
      });
      expect(teacher.presenceEvents).toBeGreaterThan(0);
      await quiet();
      expect(Object.keys(teacher.channel.presenceState())).toEqual([world.studentA.id]);
      expect(Object.keys(watcher.channel.presenceState())).toEqual([]);
      expect(Object.keys(student.channel.presenceState())).toEqual([]);
    },
    testTimeout,
  );
});

describe("live channel roster changes", () => {
  it(
    "live channel: a student removed from the class gets the empty live_state at once while the socket is still subscribed",
    async () => {
      const classroom = await createClass(world.teacher.id, "Roster changes");
      await enroll(classroom.id, world.studentB.id);
      const deck = await addDeck(classroom.id, world.teacher.id, { slideCount: 5 });
      const student = await joined(world.studentB, deck.id);
      const sessionId = await startedSession(world.teacher.client, deck.id, 2);
      await receives(student, { session_id: sessionId, revision: await revisionOf(sessionId), ended: false });
      expect((await liveState(student.client, deck.id)).state).toMatchObject({ session_id: sessionId, current_slide: 2 });

      const removed = await admin.from("enrollments").delete().eq("class_id", classroom.id).eq("student_id", world.studentB.id).select("student_id");
      expect(removed.data).toHaveLength(1);
      expect(student.channel.state).toBe("joined");
      const { state, error } = await liveState(student.client, deck.id);
      expect(error).toBeNull();
      expect(state).toEqual(noLiveState);
      const rows = await student.client.from("live_sessions").select("id").eq("deck_id", deck.id);
      expect(rows.data).toEqual([]);
      const listed = await student.client.rpc("live_now");
      expect(listed.data!.filter((row) => row.deck_id === deck.id)).toEqual([]);
    },
    testTimeout,
  );
});
