import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { liveLimits } from "../../src/lib/config";
import {
  addDeck,
  addLesson,
  addModule,
  addUnfinishedDeck,
  anon,
  createRouteWorld,
  endedSession,
  liveState,
  moveLive,
  noLiveState,
  readSession,
  readSessions,
  refused,
  removeCreatedUsers,
  setPublished,
  setSessionActive,
  startLive,
  startedSession,
  type Actor,
  type Client,
} from "./helpers";

type Deck = Awaited<ReturnType<typeof addDeck>>;

const slideCount = 5;
const staleMinutes = liveLimits.leaseMinutes + 1;
const freshMinutes = liveLimits.leaseMinutes - 1;

let world: Awaited<ReturnType<typeof createRouteWorld>>;
let shared: Awaited<ReturnType<typeof addModule>>;

function readyDeck(): Promise<Deck> {
  return addDeck(world.classroom.id, world.teacher.id, { slideCount });
}

async function running(slide = 1) {
  const deck = await readyDeck();
  const sessionId = await startedSession(world.teacher.client, deck.id, slide);
  return { deck, sessionId };
}

async function row(sessionId: string) {
  const found = await readSession(sessionId);
  if (!found) throw new Error("the session row is missing");
  return found;
}

function touch(client: Client, sessionId: string) {
  return client.rpc("touch_live", { target_session: sessionId });
}

function end(client: Client, sessionId: string) {
  return client.rpc("end_live", { target_session: sessionId });
}

async function liveRows(client: Client, deckId: string) {
  const { data, error } = await client.rpc("live_now");
  expect(error).toBeNull();
  return data!.filter((found) => found.deck_id === deckId);
}

async function draftLinkedDeck() {
  const lesson = await addLesson(shared.id, `Lesson ${randomUUID().slice(0, 8)}`, true);
  const deck = await addDeck(world.classroom.id, world.teacher.id, { lessonId: lesson.id, slideCount });
  const sessionId = await startedSession(world.teacher.client, deck.id, 2);
  await setPublished(lesson.id, false);
  return { deck, sessionId };
}

function strangers(): Actor[] {
  return [world.studentA, world.otherStudent, world.outsider, world.otherTeacher];
}

beforeAll(async () => {
  world = await createRouteWorld();
  shared = await addModule(world.classroom.id, "Week 1");
});

afterAll(removeCreatedUsers);

describe("start_live", () => {
  it("start_live: the class teacher starts a session at the given slide", async () => {
    const deck = await readyDeck();
    const { result, error } = await startLive(world.teacher.client, deck.id, 3);
    expect(error).toBeNull();
    expect(result).toEqual({ status: "started", session_id: expect.any(String) });
    const created = await row(result!.session_id!);
    expect(created).toMatchObject({ deck_id: deck.id, teacher_id: world.teacher.id, current_slide: 3, ended_at: null });
    expect(created.revision).toBeGreaterThan(0);
    expect(Math.abs(Date.now() - new Date(created.started_at).getTime())).toBeLessThan(60_000);
    expect(Math.abs(Date.now() - new Date(created.active_at).getTime())).toBeLessThan(60_000);
  });

  it("start_live: the slide is clamped into 1 to slide_count", async () => {
    const cases: [number | null, number][] = [
      [0, 1],
      [-4, 1],
      [999, slideCount],
      [null, 1],
      [slideCount, slideCount],
    ];
    for (const [asked, expected] of cases) {
      const deck = await readyDeck();
      const { result, error } = await startLive(world.teacher.client, deck.id, asked);
      expect(error).toBeNull();
      expect(result?.status).toBe("started");
      expect((await row(result!.session_id!)).current_slide).toBe(expected);
    }
  });

  it("start_live: a student, a student of another class, the outsider and another teacher get refused", async () => {
    const deck = await readyDeck();
    for (const actor of strangers()) {
      const { result, error } = await startLive(actor.client, deck.id);
      expect(error).toBeNull();
      expect(result).toEqual({ status: "refused" });
    }
    expect(await readSessions(deck.id)).toEqual([]);
  });

  it("start_live: an unknown deck and a null deck get refused", async () => {
    for (const deckId of [randomUUID(), null]) {
      const { result, error } = await startLive(world.teacher.client, deckId as string);
      expect(error).toBeNull();
      expect(result).toEqual({ status: "refused" });
    }
  });

  it("start_live: anon cannot call it", async () => {
    const deck = await readyDeck();
    const { result, error } = await startLive(anon, deck.id);
    expect(error?.code).toBe(refused);
    expect(result).toBeNull();
    expect(await readSessions(deck.id)).toEqual([]);
  });

  it("start_live: an unfinished deck gives not_ready for its teacher and refused for a student", async () => {
    const deck = await addUnfinishedDeck(world.classroom.id, world.teacher.id);
    expect((await startLive(world.teacher.client, deck.id)).result).toEqual({ status: "not_ready" });
    expect((await startLive(world.studentA.client, deck.id)).result).toEqual({ status: "refused" });
    expect(await readSessions(deck.id)).toEqual([]);
  });

  it("start_live: a second call while running resumes the same session and keeps slide and revision", async () => {
    const { deck, sessionId } = await running(2);
    const before = await row(sessionId);
    const { result, error } = await startLive(world.teacher.client, deck.id, 4);
    expect(error).toBeNull();
    expect(result).toEqual({ status: "resumed", session_id: sessionId });
    const after = await row(sessionId);
    expect(after.current_slide).toBe(2);
    expect(after.revision).toBe(before.revision);
    expect(after.ended_at).toBeNull();
    expect(await readSessions(deck.id)).toHaveLength(1);
  });

  it("start_live: two calls fired at once end with exactly one open session and no error", async () => {
    for (let round = 0; round < 3; round += 1) {
      const deck = await readyDeck();
      const answers = await Promise.all([
        startLive(world.teacher.client, deck.id, 1),
        startLive(world.teacher.client, deck.id, 2),
        startLive(world.teacher.client, deck.id, 3),
      ]);
      expect(answers.map((answer) => answer.error)).toEqual([null, null, null]);
      expect(answers.map((answer) => answer.result!.status).sort()).toEqual(["resumed", "resumed", "started"]);
      expect(new Set(answers.map((answer) => answer.result!.session_id)).size).toBe(1);
      const rows = await readSessions(deck.id);
      expect(rows).toHaveLength(1);
      expect(rows[0].ended_at).toBeNull();
    }
  });

  it("start_live: a start over a session past the lease closes it and starts a new one", async () => {
    const { deck, sessionId } = await running(2);
    await setSessionActive(sessionId, staleMinutes);
    const { result, error } = await startLive(world.teacher.client, deck.id, 4);
    expect(error).toBeNull();
    expect(result?.status).toBe("started");
    expect(result!.session_id).not.toBe(sessionId);
    const old = await row(sessionId);
    const fresh = await row(result!.session_id!);
    expect(old.ended_at).not.toBeNull();
    expect(fresh).toMatchObject({ current_slide: 4, ended_at: null });
    expect(fresh.revision).toBeGreaterThan(old.revision);
    expect(await readSessions(deck.id)).toHaveLength(2);
  });

  it("start_live: a start after an ended session gives a new session", async () => {
    const deck = await readyDeck();
    const endedId = await endedSession(world.teacher.client, deck.id);
    const { result } = await startLive(world.teacher.client, deck.id, 1);
    expect(result?.status).toBe("started");
    expect(result!.session_id).not.toBe(endedId);
  });
});

describe("move_live", () => {
  it("move_live: the teacher moves and the answer carries a higher revision", async () => {
    const { sessionId } = await running(1);
    const before = await row(sessionId);
    const { result, error } = await moveLive(world.teacher.client, sessionId, 4);
    expect(error).toBeNull();
    expect(result).toEqual({ status: "moved", revision: expect.any(Number) });
    expect(result!.revision).toBeGreaterThan(before.revision);
    const after = await row(sessionId);
    expect(after).toMatchObject({ current_slide: 4, revision: result!.revision, ended_at: null });
    const next = await moveLive(world.teacher.client, sessionId, slideCount);
    expect(next.result!.revision).toBeGreaterThan(result!.revision!);
    expect((await row(sessionId)).current_slide).toBe(slideCount);
  });

  it("move_live: slide 0, slide_count + 1 and null give bad_slide and change nothing", async () => {
    const { sessionId } = await running(2);
    const before = await row(sessionId);
    for (const slide of [0, -1, slideCount + 1, null]) {
      const { result, error } = await moveLive(world.teacher.client, sessionId, slide);
      expect(error).toBeNull();
      expect(result).toEqual({ status: "bad_slide" });
    }
    const after = await row(sessionId);
    expect(after.current_slide).toBe(2);
    expect(after.revision).toBe(before.revision);
  });

  it("move_live: a student, another teacher and an unknown session id all get the same refused", async () => {
    const { sessionId } = await running(2);
    const before = await row(sessionId);
    for (const actor of strangers()) {
      const { result, error } = await moveLive(actor.client, sessionId, 3);
      expect(error).toBeNull();
      expect(result).toEqual({ status: "refused" });
    }
    for (const unknown of [randomUUID(), null]) {
      const { result, error } = await moveLive(world.teacher.client, unknown as string, 3);
      expect(error).toBeNull();
      expect(result).toEqual({ status: "refused" });
    }
    expect(await row(sessionId)).toEqual(before);
  });

  it("move_live: a closed session answers ended and stays as it was", async () => {
    const deck = await readyDeck();
    const sessionId = await endedSession(world.teacher.client, deck.id, 2);
    const before = await row(sessionId);
    const { result, error } = await moveLive(world.teacher.client, sessionId, 3);
    expect(error).toBeNull();
    expect(result).toEqual({ status: "ended" });
    expect(await row(sessionId)).toEqual(before);
    expect((await moveLive(world.studentA.client, sessionId, 3)).result).toEqual({ status: "refused" });
  });

  it("move_live: a session past the lease answers ended and the row is closed", async () => {
    const { sessionId } = await running(2);
    await setSessionActive(sessionId, staleMinutes);
    const before = await row(sessionId);
    const { result, error } = await moveLive(world.teacher.client, sessionId, 3);
    expect(error).toBeNull();
    expect(result).toEqual({ status: "ended" });
    const after = await row(sessionId);
    expect(after.ended_at).not.toBeNull();
    expect(after.current_slide).toBe(2);
    expect(after.revision).toBeGreaterThan(before.revision);
  });

  it("move_live: a student cannot close a session past the lease", async () => {
    const { sessionId } = await running(2);
    await setSessionActive(sessionId, staleMinutes);
    expect((await moveLive(world.studentA.client, sessionId, 3)).result).toEqual({ status: "refused" });
    expect((await touch(world.studentA.client, sessionId)).data).toBe("refused");
    expect((await end(world.studentA.client, sessionId)).data).toBe("refused");
    expect((await row(sessionId)).ended_at).toBeNull();
  });

  it("move_live: anon cannot call it", async () => {
    const { sessionId } = await running(2);
    const { result, error } = await moveLive(anon, sessionId, 3);
    expect(error?.code).toBe(refused);
    expect(result).toBeNull();
    expect((await row(sessionId)).current_slide).toBe(2);
  });
});

describe("touch_live", () => {
  it("touch_live: open, active_at moves forward and revision and slide stay", async () => {
    const { sessionId } = await running(3);
    await setSessionActive(sessionId, 10);
    const before = await row(sessionId);
    const { data, error } = await touch(world.teacher.client, sessionId);
    expect(error).toBeNull();
    expect(data).toBe("open");
    const after = await row(sessionId);
    expect(new Date(after.active_at).getTime()).toBeGreaterThan(new Date(before.active_at).getTime());
    expect(Math.abs(Date.now() - new Date(after.active_at).getTime())).toBeLessThan(60_000);
    expect(after).toMatchObject({ revision: before.revision, current_slide: 3, ended_at: null });
  });

  it("touch_live: a closed session answers ended and a session past the lease is closed", async () => {
    const deck = await readyDeck();
    const closedId = await endedSession(world.teacher.client, deck.id);
    const closedBefore = await row(closedId);
    expect((await touch(world.teacher.client, closedId)).data).toBe("ended");
    expect(await row(closedId)).toEqual(closedBefore);
    const { sessionId } = await running();
    await setSessionActive(sessionId, staleMinutes);
    const { data, error } = await touch(world.teacher.client, sessionId);
    expect(error).toBeNull();
    expect(data).toBe("ended");
    expect((await row(sessionId)).ended_at).not.toBeNull();
  });

  it("touch_live: a student, another teacher and an unknown session id get refused", async () => {
    const { sessionId } = await running();
    await setSessionActive(sessionId, 10);
    const before = await row(sessionId);
    for (const actor of strangers()) {
      const { data, error } = await touch(actor.client, sessionId);
      expect(error).toBeNull();
      expect(data).toBe("refused");
    }
    expect((await touch(world.teacher.client, randomUUID())).data).toBe("refused");
    expect(await row(sessionId)).toEqual(before);
  });

  it("touch_live: anon cannot call it", async () => {
    const { sessionId } = await running();
    const { data, error } = await touch(anon, sessionId);
    expect(error?.code).toBe(refused);
    expect(data).toBeNull();
  });
});

describe("end_live", () => {
  it("end_live: ended, the row has ended_at and a higher revision, and a second call changes nothing", async () => {
    const { sessionId } = await running(3);
    const before = await row(sessionId);
    const { data, error } = await end(world.teacher.client, sessionId);
    expect(error).toBeNull();
    expect(data).toBe("ended");
    const after = await row(sessionId);
    expect(after.ended_at).not.toBeNull();
    expect(after.current_slide).toBe(3);
    expect(after.revision).toBeGreaterThan(before.revision);
    const again = await end(world.teacher.client, sessionId);
    expect(again.error).toBeNull();
    expect(again.data).toBe("ended");
    expect(await row(sessionId)).toEqual(after);
  });

  it("end_live: a student, another teacher and an unknown session id get refused", async () => {
    const { sessionId } = await running();
    const before = await row(sessionId);
    for (const actor of strangers()) {
      const { data, error } = await end(actor.client, sessionId);
      expect(error).toBeNull();
      expect(data).toBe("refused");
    }
    expect((await end(world.teacher.client, randomUUID())).data).toBe("refused");
    expect(await row(sessionId)).toEqual(before);
  });

  it("end_live: anon cannot call it", async () => {
    const { sessionId } = await running();
    const { data, error } = await end(anon, sessionId);
    expect(error?.code).toBe(refused);
    expect(data).toBeNull();
    expect((await row(sessionId)).ended_at).toBeNull();
  });
});

describe("live_now", () => {
  it("live_now: lists the running session for the teacher and for an enrolled student", async () => {
    const { deck, sessionId } = await running(3);
    const created = await row(sessionId);
    for (const actor of [world.teacher, world.studentA, world.studentB]) {
      expect(await liveRows(actor.client, deck.id)).toEqual([
        {
          deck_id: deck.id,
          class_id: world.classroom.id,
          session_id: sessionId,
          current_slide: 3,
          revision: created.revision,
        },
      ]);
    }
  });

  it("live_now: a student of another class, the outsider and another teacher do not see it", async () => {
    const { deck } = await running();
    for (const actor of [world.otherStudent, world.outsider, world.otherTeacher]) {
      expect(await liveRows(actor.client, deck.id)).toEqual([]);
    }
  });

  it("live_now: anon cannot call it", async () => {
    const { data, error } = await anon.rpc("live_now");
    expect(error?.code).toBe(refused);
    expect(data).toBeNull();
  });

  it("live_now: an ended session is not listed", async () => {
    const deck = await readyDeck();
    await endedSession(world.teacher.client, deck.id);
    for (const actor of [world.teacher, world.studentA]) {
      expect(await liveRows(actor.client, deck.id)).toEqual([]);
    }
  });

  it("live_now: a session past the lease is not listed and the read does not close it", async () => {
    const { deck, sessionId } = await running(2);
    await setSessionActive(sessionId, staleMinutes);
    const before = await row(sessionId);
    for (const actor of [world.teacher, world.studentA]) {
      expect(await liveRows(actor.client, deck.id)).toEqual([]);
    }
    const after = await row(sessionId);
    expect(after.ended_at).toBeNull();
    expect(after).toEqual(before);
  });

  it("live_now: a session of a deck linked to a draft lesson is listed for the teacher only", async () => {
    const { deck, sessionId } = await draftLinkedDeck();
    expect(await liveRows(world.studentA.client, deck.id)).toEqual([]);
    expect((await liveRows(world.teacher.client, deck.id)).map((found) => found.session_id)).toEqual([sessionId]);
  });

  it("live_now: it answers through a read-only request", async () => {
    const { deck, sessionId } = await running();
    const { data, error } = await world.studentA.client.rpc("live_now", {}, { get: true });
    expect(error).toBeNull();
    expect(data!.filter((found) => found.deck_id === deck.id).map((found) => found.session_id)).toEqual([sessionId]);
  });
});

describe("live_state", () => {
  it("live_state: a deck with no session gives the empty answer", async () => {
    const deck = await readyDeck();
    for (const actor of [world.teacher, world.studentA]) {
      const { state, error } = await liveState(actor.client, deck.id);
      expect(error).toBeNull();
      expect(state).toEqual(noLiveState);
    }
    expect(noLiveState).toEqual({ session_id: null, current_slide: null, revision: 0, running: false, content_version: null });
  });

  it("live_state: a running session is returned to the teacher and an enrolled student", async () => {
    const { deck, sessionId } = await running(3);
    const created = await row(sessionId);
    for (const actor of [world.teacher, world.studentA, world.studentB]) {
      const { state, error } = await liveState(actor.client, deck.id);
      expect(error).toBeNull();
      expect(state).toEqual({ session_id: sessionId, current_slide: 3, revision: created.revision, running: true, content_version: null });
    }
  });

  it("live_state: after the end it gives running false with the same session, the last slide and a higher revision", async () => {
    const { deck, sessionId } = await running(1);
    const moved = await moveLive(world.teacher.client, sessionId, 4);
    expect((await liveState(world.studentA.client, deck.id)).state).toEqual({
      session_id: sessionId,
      current_slide: 4,
      revision: moved.result!.revision,
      running: true,
      content_version: null,
    });
    await world.teacher.client.rpc("end_live", { target_session: sessionId });
    const { state } = await liveState(world.studentA.client, deck.id);
    expect(state).toMatchObject({ session_id: sessionId, current_slide: 4, running: false, content_version: null });
    expect(state!.revision).toBeGreaterThan(moved.result!.revision!);
  });

  it("live_state: a session past the lease reads running false and the read does not close it", async () => {
    const { deck, sessionId } = await running(2);
    await setSessionActive(sessionId, staleMinutes);
    const before = await row(sessionId);
    for (const actor of [world.teacher, world.studentA]) {
      const { state } = await liveState(actor.client, deck.id);
      expect(state).toEqual({ session_id: sessionId, current_slide: 2, revision: before.revision, running: false, content_version: null });
    }
    expect(await row(sessionId)).toEqual(before);
  });

  it("live_state: with two sessions over time it returns the one with the highest revision", async () => {
    const deck = await readyDeck();
    const firstId = await endedSession(world.teacher.client, deck.id, 5);
    const first = await row(firstId);
    expect((await liveState(world.studentA.client, deck.id)).state).toMatchObject({ session_id: firstId, running: false, content_version: null });
    const secondId = await startedSession(world.teacher.client, deck.id, 2);
    const second = await row(secondId);
    expect(second.revision).toBeGreaterThan(first.revision);
    expect((await liveState(world.studentA.client, deck.id)).state).toEqual({
      session_id: secondId,
      current_slide: 2,
      revision: second.revision,
      running: true,
      content_version: null,
    });
    await world.teacher.client.rpc("end_live", { target_session: secondId });
    expect((await liveState(world.studentA.client, deck.id)).state).toMatchObject({ session_id: secondId, running: false, content_version: null });
  });

  it("live_state: a student of another class, the outsider and another teacher get the empty answer", async () => {
    const { deck } = await running(3);
    for (const actor of [world.otherStudent, world.outsider, world.otherTeacher]) {
      const { state, error } = await liveState(actor.client, deck.id);
      expect(error).toBeNull();
      expect(state).toEqual(noLiveState);
    }
  });

  it("live_state: an unknown deck and a null deck give the empty answer", async () => {
    for (const deckId of [randomUUID(), null]) {
      const { state, error } = await liveState(world.teacher.client, deckId as string);
      expect(error).toBeNull();
      expect(state).toEqual(noLiveState);
    }
  });

  it("live_state: a student gets the empty answer for a deck linked to a draft lesson", async () => {
    const { deck, sessionId } = await draftLinkedDeck();
    expect((await liveState(world.studentA.client, deck.id)).state).toEqual(noLiveState);
    expect((await liveState(world.teacher.client, deck.id)).state).toMatchObject({ session_id: sessionId, running: true, content_version: null });
  });

  it("live_state: anon cannot call it", async () => {
    const { deck } = await running();
    const { state, error } = await liveState(anon, deck.id);
    expect(error?.code).toBe(refused);
    expect(state).toBeNull();
  });

  it("live_state: it answers through a read-only request", async () => {
    const { deck, sessionId } = await running(2);
    const { data, error } = await world.studentA.client.rpc("live_state", { target_deck: deck.id }, { get: true });
    expect(error).toBeNull();
    expect(data).toMatchObject({ session_id: sessionId, current_slide: 2, running: true, content_version: null });
  });
});

describe("live lease", () => {
  it("live lease: the lease in SQL matches liveLimits.leaseMinutes", async () => {
    expect(liveLimits.leaseMinutes).toBe(30);
    const fresh = await running(2);
    const stale = await running(2);
    await setSessionActive(fresh.sessionId, freshMinutes);
    await setSessionActive(stale.sessionId, staleMinutes);
    expect((await liveState(world.studentA.client, fresh.deck.id)).state?.running).toBe(true);
    expect((await liveState(world.studentA.client, stale.deck.id)).state?.running).toBe(false);
    expect(await liveRows(world.studentA.client, fresh.deck.id)).toHaveLength(1);
    expect(await liveRows(world.studentA.client, stale.deck.id)).toEqual([]);
    expect((await startLive(world.teacher.client, fresh.deck.id)).result).toEqual({ status: "resumed", session_id: fresh.sessionId });
    await setSessionActive(fresh.sessionId, freshMinutes);
    expect((await touch(world.teacher.client, fresh.sessionId)).data).toBe("open");
    expect((await touch(world.teacher.client, stale.sessionId)).data).toBe("ended");
  });
});
