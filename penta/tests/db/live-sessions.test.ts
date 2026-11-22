import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Database } from "../../src/lib/database.types";
import {
  addDeck,
  addLesson,
  addModule,
  addSession,
  admin,
  anon,
  checkFailed,
  createRouteWorld,
  duplicateKey,
  endedSession,
  enroll,
  minutesAgo,
  moveLive,
  readSession,
  readSessions,
  refused,
  removeCreatedUsers,
  sessionColumns,
  setPublished,
  startedSession,
  type Client,
} from "./helpers";

type SessionInsert = Database["public"]["Tables"]["live_sessions"]["Insert"];
type Deck = Awaited<ReturnType<typeof addDeck>>;
type Session = NonNullable<Awaited<ReturnType<typeof readSession>>>;

let world: Awaited<ReturnType<typeof createRouteWorld>>;
let shared: Awaited<ReturnType<typeof addModule>>;
let deck: Deck;
let session: Session;

function readyDeck(slideCount = 5) {
  return addDeck(world.classroom.id, world.teacher.id, { slideCount });
}

async function openSession(deckId: string, slide = 1): Promise<Session> {
  const row = await readSession(await startedSession(world.teacher.client, deckId, slide));
  if (!row) throw new Error("the started session was not found");
  return row;
}

function readAs(client: Client, deckId: string) {
  return client.from("live_sessions").select(sessionColumns).eq("deck_id", deckId);
}

function everyClient(): Client[] {
  return [
    world.studentA.client,
    world.otherStudent.client,
    world.outsider.client,
    world.teacher.client,
    world.otherTeacher.client,
    anon,
  ];
}

beforeAll(async () => {
  world = await createRouteWorld();
  shared = await addModule(world.classroom.id, "Week 1");
  deck = await readyDeck();
  session = await openSession(deck.id, 2);
});

afterAll(removeCreatedUsers);

describe("live_sessions select", () => {
  it("live_sessions select: the class teacher and an enrolled student read the session row", async () => {
    for (const actor of [world.teacher, world.studentA, world.studentB]) {
      const { data, error } = await readAs(actor.client, deck.id);
      expect(error).toBeNull();
      expect(data).toEqual([session]);
    }
  });

  it("live_sessions select: a student from another class cannot read it, nor another teacher or the outsider", async () => {
    for (const actor of [world.otherStudent, world.otherTeacher, world.outsider]) {
      const byDeck = await readAs(actor.client, deck.id);
      expect(byDeck.error).toBeNull();
      expect(byDeck.data).toEqual([]);
      const byId = await actor.client.from("live_sessions").select(sessionColumns).eq("id", session.id);
      expect(byId.error).toBeNull();
      expect(byId.data).toEqual([]);
      const everything = await actor.client.from("live_sessions").select("id, deck_id");
      expect(everything.error).toBeNull();
      expect(everything.data!.some((row) => row.deck_id === deck.id)).toBe(false);
    }
  });

  it("live_sessions select: anon is refused, also by direct id", async () => {
    for (const query of [readAs(anon, deck.id), anon.from("live_sessions").select("id").eq("id", session.id)]) {
      const { data, error } = await query;
      expect(error?.code).toBe(refused);
      expect(data).toBeNull();
    }
  });

  it("live_sessions select: a student does not see the session of a deck linked to a draft lesson", async () => {
    const lesson = await addLesson(shared.id, `Lesson ${randomUUID().slice(0, 8)}`, true);
    const linked = await addDeck(world.classroom.id, world.teacher.id, { lessonId: lesson.id });
    const linkedSession = await openSession(linked.id);
    expect((await readAs(world.studentA.client, linked.id)).data).toEqual([linkedSession]);
    await setPublished(lesson.id, false);
    const asStudent = await readAs(world.studentA.client, linked.id);
    expect(asStudent.error).toBeNull();
    expect(asStudent.data).toEqual([]);
    const byId = await world.studentA.client.from("live_sessions").select("id").eq("id", linkedSession.id);
    expect(byId.data).toEqual([]);
    expect((await readAs(world.teacher.client, linked.id)).data).toEqual([linkedSession]);
  });

  it("live_sessions select: a student removed from the class no longer reads the row", async () => {
    const own = await readyDeck();
    await openSession(own.id);
    await enroll(world.classroom.id, world.outsider.id);
    expect((await readAs(world.outsider.client, own.id)).data).toHaveLength(1);
    const removed = await admin
      .from("enrollments")
      .delete()
      .eq("class_id", world.classroom.id)
      .eq("student_id", world.outsider.id)
      .select("student_id");
    expect(removed.data).toHaveLength(1);
    const after = await readAs(world.outsider.client, own.id);
    expect(after.error).toBeNull();
    expect(after.data).toEqual([]);
  });
});

describe("live_sessions writes through the API", () => {
  it("live_sessions insert: no API role can insert a row, the class teacher included", async () => {
    const target = await readyDeck();
    const rows: SessionInsert[] = [
      { deck_id: target.id, teacher_id: world.teacher.id, current_slide: 1 },
      { deck_id: target.id, teacher_id: world.studentA.id, current_slide: 1 },
      { deck_id: target.id, teacher_id: world.teacher.id, current_slide: 1, revision: 999999 },
      { deck_id: target.id, teacher_id: world.teacher.id, current_slide: 1, ended_at: minutesAgo(1) },
    ];
    for (const client of everyClient()) {
      for (const row of rows) {
        expect((await client.from("live_sessions").insert(row)).error?.code).toBe(refused);
      }
    }
    expect(await readSessions(target.id)).toEqual([]);
  });

  it("live_sessions update: a student cannot update live_sessions, and no other API role can either", async () => {
    const before = await readSession(session.id);
    const changes = [
      { current_slide: 4 },
      { revision: 1 },
      { active_at: new Date().toISOString() },
      { ended_at: new Date().toISOString() },
      { started_at: minutesAgo(60) },
      { teacher_id: world.studentA.id },
      { deck_id: randomUUID() },
      { id: randomUUID() },
    ];
    for (const client of everyClient()) {
      for (const change of changes) {
        expect((await client.from("live_sessions").update(change).eq("id", session.id)).error?.code).toBe(refused);
        expect((await client.from("live_sessions").update(change).eq("deck_id", deck.id)).error?.code).toBe(refused);
      }
    }
    expect(await readSession(session.id)).toEqual(before);
  });

  it("live_sessions delete: no API role can delete a row", async () => {
    const before = await readSession(session.id);
    for (const client of everyClient()) {
      expect((await client.from("live_sessions").delete().eq("id", session.id)).error?.code).toBe(refused);
      expect((await client.from("live_sessions").delete().eq("deck_id", deck.id)).error?.code).toBe(refused);
    }
    expect(await readSession(session.id)).toEqual(before);
  });

  it("live_sessions upsert: an upsert over an existing row is refused", async () => {
    const before = await readSession(session.id);
    for (const client of [world.studentA.client, world.teacher.client]) {
      const { error } = await client
        .from("live_sessions")
        .upsert({ id: session.id, deck_id: deck.id, teacher_id: world.teacher.id, current_slide: 5 });
      expect(error?.code).toBe(refused);
    }
    expect(await readSession(session.id)).toEqual(before);
  });
});

describe("live_sessions constraints", () => {
  it("live_sessions constraints: a second open session for the same deck gives 23505", async () => {
    const target = await readyDeck();
    const first = await openSession(target.id);
    const second = await admin.from("live_sessions").insert({ deck_id: target.id, teacher_id: world.teacher.id, current_slide: 1 });
    expect(second.error?.code).toBe(duplicateKey);
    expect(await readSessions(target.id)).toEqual([first]);
  });

  it("live_sessions constraints: closed sessions and one open session live side by side", async () => {
    const target = await readyDeck();
    await endedSession(world.teacher.client, target.id);
    await endedSession(world.teacher.client, target.id);
    await openSession(target.id);
    const rows = await readSessions(target.id);
    expect(rows).toHaveLength(3);
    expect(rows.filter((row) => row.ended_at === null)).toHaveLength(1);
  });

  it("live_sessions constraints: the admin client adds a closed session next to an open one", async () => {
    const target = await readyDeck();
    const open = await openSession(target.id);
    const closed = await addSession(target.id, world.teacher.id, { ended: true });
    expect(closed.ended_at).not.toBeNull();
    expect((await readSessions(target.id)).map((row) => row.id)).toEqual([open.id, closed.id]);
  });

  it("live_sessions constraints: reopening a closed session next to an open one gives 23505", async () => {
    const target = await readyDeck();
    const closedId = await endedSession(world.teacher.client, target.id);
    await openSession(target.id);
    const { error } = await admin.from("live_sessions").update({ ended_at: null }).eq("id", closedId);
    expect(error?.code).toBe(duplicateKey);
  });

  it("live_sessions constraints: current_slide 0 and a negative slide give 23514", async () => {
    const target = await readyDeck();
    for (const slide of [0, -1]) {
      const { error } = await admin.from("live_sessions").insert({ deck_id: target.id, teacher_id: world.teacher.id, current_slide: slide });
      expect(error?.code).toBe(checkFailed);
    }
    const open = await openSession(target.id);
    expect((await admin.from("live_sessions").update({ current_slide: 0 }).eq("id", open.id)).error?.code).toBe(checkFailed);
    expect(await readSessions(target.id)).toEqual([open]);
  });

  it("live_sessions cascade: deleting the deck removes its sessions and leaves the others", async () => {
    const target = await readyDeck();
    const kept = await readyDeck();
    await endedSession(world.teacher.client, target.id);
    await openSession(target.id);
    const keptSession = await openSession(kept.id);
    const { error } = await admin.from("decks").delete().eq("id", target.id);
    expect(error).toBeNull();
    expect(await readSessions(target.id)).toEqual([]);
    expect(await readSessions(kept.id)).toEqual([keptSession]);
  });
});

describe("live_sessions revision", () => {
  it("live_sessions revision: an insert gets a positive revision and a later insert a higher one", async () => {
    const target = await readyDeck();
    const first = await readSession(await endedSession(world.teacher.client, target.id));
    const second = await openSession(target.id);
    expect(first!.revision).toBeGreaterThan(0);
    expect(second.revision).toBeGreaterThan(first!.revision);
  });

  it("live_sessions revision: a revision given on insert by the admin client is replaced", async () => {
    const target = await readyDeck();
    const { data, error } = await admin
      .from("live_sessions")
      .insert({ deck_id: target.id, teacher_id: world.teacher.id, current_slide: 1, revision: 1 })
      .select(sessionColumns)
      .single();
    expect(error).toBeNull();
    expect(data!.revision).toBeGreaterThan(session.revision);
  });

  it("live_sessions revision: it rises on a change of current_slide and on a change of ended_at", async () => {
    const target = await readyDeck();
    const created = await openSession(target.id);
    expect((await moveLive(world.teacher.client, created.id, 3)).result?.status).toBe("moved");
    const moved = await readSession(created.id);
    expect(moved!.current_slide).toBe(3);
    expect(moved!.revision).toBeGreaterThan(created.revision);
    expect((await world.teacher.client.rpc("end_live", { target_session: created.id })).data).toBe("ended");
    const ended = await readSession(created.id);
    expect(ended!.ended_at).not.toBeNull();
    expect(ended!.revision).toBeGreaterThan(moved!.revision);
  });

  it("live_sessions revision: it does not change when only active_at changes", async () => {
    const target = await readyDeck();
    const created = await openSession(target.id);
    const { error } = await admin.from("live_sessions").update({ active_at: minutesAgo(5) }).eq("id", created.id);
    expect(error).toBeNull();
    const touched = await readSession(created.id);
    expect(touched!.active_at).not.toBe(created.active_at);
    expect(touched!.revision).toBe(created.revision);
  });

  it("live_sessions revision: the admin client cannot write a revision back to a lower value", async () => {
    const target = await readyDeck();
    const created = await openSession(target.id);
    const { error } = await admin.from("live_sessions").update({ current_slide: 2, revision: 1 }).eq("id", created.id);
    expect(error).toBeNull();
    expect((await readSession(created.id))!.revision).toBeGreaterThan(created.revision);
  });

  it("live_sessions revision: two sessions of different decks never share a revision", async () => {
    const [first, second] = await Promise.all([readyDeck(), readyDeck()]);
    const sessions = await Promise.all([openSession(first.id), openSession(second.id)]);
    const moves = await Promise.all(
      sessions.flatMap((row) => [2, 3, 4].map((slide) => moveLive(world.teacher.client, row.id, slide))),
    );
    const seen = [...sessions.map((row) => row.revision), ...moves.map((move) => move.result!.revision!)];
    expect(seen).toHaveLength(8);
    expect(seen.every((revision) => Number.isInteger(revision))).toBe(true);
    expect(new Set(seen).size).toBe(seen.length);
  });
});
