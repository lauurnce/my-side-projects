import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  addDeck,
  addLesson,
  addModule,
  addUnfinishedDeck,
  admin,
  anon,
  createClass,
  createRouteWorld,
  duplicateKey,
  enroll,
  readViews,
  recordView,
  refused,
  removeCreatedUsers,
  setPublished,
  type Actor,
  type Client,
} from "./helpers";

type Deck = Awaited<ReturnType<typeof addDeck>>;

let world: Awaited<ReturnType<typeof createRouteWorld>>;
let shared: Awaited<ReturnType<typeof addModule>>;
let unfinished: Deck;
let onDraft: Deck;
let foreignDeck: Deck;

const upsertOptions = { onConflict: "deck_id,student_id,slide_no", ignoreDuplicates: true };

function readyDeck(slideCount = 5) {
  return addDeck(world.classroom.id, world.teacher.id, { slideCount });
}

function view(actor: Actor, deckId: string, slideNo: number, studentId = actor.id) {
  return actor.client.from("deck_views").insert({ deck_id: deckId, student_id: studentId, slide_no: slideNo });
}

function viewOnce(actor: Actor, deckId: string, slideNo: number, studentId = actor.id) {
  return actor.client
    .from("deck_views")
    .upsert({ deck_id: deckId, student_id: studentId, slide_no: slideNo }, upsertOptions);
}

function readAs(client: Client, deckId: string) {
  return client.from("deck_views").select("deck_id, student_id, slide_no").eq("deck_id", deckId).order("slide_no");
}

beforeAll(async () => {
  world = await createRouteWorld();
  shared = await addModule(world.classroom.id, "Week 1");
  const draft = await addLesson(shared.id, "Draft lesson");
  unfinished = await addUnfinishedDeck(world.classroom.id, world.teacher.id);
  onDraft = await addDeck(world.classroom.id, world.teacher.id, { lessonId: draft.id });
  foreignDeck = await addDeck(world.otherClassroom.id, world.otherTeacher.id);
});

afterAll(removeCreatedUsers);

describe("deck_views insert", () => {
  it("deck_views insert: a student records a view of a readable deck", async () => {
    const deck = await readyDeck();
    const { data, error } = await world.studentA.client
      .from("deck_views")
      .insert({ deck_id: deck.id, student_id: world.studentA.id, slide_no: 1 })
      .select("deck_id, student_id, slide_no, viewed_at");
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
    expect(data![0]).toMatchObject({ deck_id: deck.id, student_id: world.studentA.id, slide_no: 1 });
    expect(Math.abs(Date.now() - new Date(data![0].viewed_at).getTime())).toBeLessThan(60_000);
    expect(await readViews(deck.id)).toEqual(data);
  });

  it("deck_views insert: the first and the last slide are accepted, and a deck on a published lesson too", async () => {
    const lesson = await addLesson(shared.id, `Lesson ${randomUUID().slice(0, 8)}`, true);
    const deck = await addDeck(world.classroom.id, world.teacher.id, { lessonId: lesson.id, slideCount: 3 });
    expect((await view(world.studentA, deck.id, 1)).error).toBeNull();
    expect((await view(world.studentA, deck.id, 3)).error).toBeNull();
    expect((await readViews(deck.id)).map((row) => row.slide_no)).toEqual([1, 3]);
  });

  it("deck_views insert: a second identical insert gives 23505", async () => {
    const deck = await readyDeck();
    expect((await view(world.studentA, deck.id, 2)).error).toBeNull();
    const again = await view(world.studentA, deck.id, 2);
    expect(again.error?.code).toBe(duplicateKey);
    expect(await readViews(deck.id)).toHaveLength(1);
  });

  it("deck_views insert: the upsert with ignoreDuplicates is not an error and leaves one row", async () => {
    const deck = await readyDeck();
    const first = await viewOnce(world.studentA, deck.id, 2);
    expect(first.error).toBeNull();
    const afterFirst = await readViews(deck.id);
    expect(afterFirst).toHaveLength(1);
    const second = await viewOnce(world.studentA, deck.id, 2);
    expect(second.error).toBeNull();
    expect(await readViews(deck.id)).toEqual(afterFirst);
  });

  it("deck_views insert: two students each record the same slide", async () => {
    const deck = await readyDeck();
    expect((await view(world.studentA, deck.id, 1)).error).toBeNull();
    expect((await view(world.studentB, deck.id, 1)).error).toBeNull();
    expect((await readViews(deck.id)).map((row) => row.student_id).sort()).toEqual([world.studentA.id, world.studentB.id].sort());
  });

  it("deck_views insert: a student cannot record a view for another student", async () => {
    const deck = await readyDeck();
    expect((await view(world.studentA, deck.id, 1, world.studentB.id)).error?.code).toBe(refused);
    expect((await viewOnce(world.studentA, deck.id, 1, world.studentB.id)).error?.code).toBe(refused);
    expect(await readViews(deck.id)).toEqual([]);
  });

  it("deck_views insert: a slide number above slide_count is refused", async () => {
    const deck = await readyDeck(5);
    for (const slideNo of [6, 300, 301, 2147483647]) {
      expect((await view(world.studentA, deck.id, slideNo)).error?.code).toBe(refused);
      expect((await viewOnce(world.studentA, deck.id, slideNo)).error?.code).toBe(refused);
    }
    expect(await readViews(deck.id)).toEqual([]);
  });

  it("deck_views insert: slide 0 and a negative slide are refused by the policy with 42501", async () => {
    const deck = await readyDeck();
    for (const slideNo of [0, -1]) {
      expect((await view(world.studentA, deck.id, slideNo)).error?.code).toBe(refused);
    }
    expect(await readViews(deck.id)).toEqual([]);
  });

  it("deck_views insert: an unfinished deck, a deck on a draft lesson and a deck of another class are refused", async () => {
    for (const deck of [unfinished, onDraft, foreignDeck]) {
      expect((await view(world.studentA, deck.id, 1)).error?.code).toBe(refused);
      expect((await viewOnce(world.studentA, deck.id, 1)).error?.code).toBe(refused);
      expect(await readViews(deck.id)).toEqual([]);
    }
  });

  it("deck_views insert: a view is refused again after the lesson is unpublished", async () => {
    const lesson = await addLesson(shared.id, `Lesson ${randomUUID().slice(0, 8)}`, true);
    const deck = await addDeck(world.classroom.id, world.teacher.id, { lessonId: lesson.id });
    expect((await view(world.studentA, deck.id, 1)).error).toBeNull();
    await setPublished(lesson.id, false);
    expect((await view(world.studentA, deck.id, 2)).error?.code).toBe(refused);
    expect(await readViews(deck.id)).toHaveLength(1);
  });

  it("deck_views insert: a random deck id is refused with 42501 and never 23503", async () => {
    expect((await view(world.studentA, randomUUID(), 1)).error?.code).toBe(refused);
  });

  it("deck_views insert: the outsider and a student of another class cannot record a view", async () => {
    const deck = await readyDeck();
    for (const actor of [world.outsider, world.otherStudent]) {
      expect((await view(actor, deck.id, 1)).error?.code).toBe(refused);
    }
    expect(await readViews(deck.id)).toEqual([]);
  });

  it("deck_views insert: a teacher cannot record a view, for themselves or for a student", async () => {
    const deck = await readyDeck();
    for (const teacher of [world.teacher, world.otherTeacher]) {
      for (const studentId of [teacher.id, world.studentA.id]) {
        expect((await view(teacher, deck.id, 1, studentId)).error?.code).toBe(refused);
      }
    }
    expect(await readViews(deck.id)).toEqual([]);
  });

  it("deck_views insert: anon cannot record a view", async () => {
    const deck = await readyDeck();
    const { error } = await anon.from("deck_views").insert({ deck_id: deck.id, student_id: world.studentA.id, slide_no: 1 });
    expect(error?.code).toBe(refused);
    expect(await readViews(deck.id)).toEqual([]);
  });

  it("deck_views insert: viewed_at cannot be set by the client", async () => {
    const deck = await readyDeck();
    const { error } = await world.studentA.client
      .from("deck_views")
      .insert({ deck_id: deck.id, student_id: world.studentA.id, slide_no: 1, viewed_at: "2020-01-01T00:00:00Z" });
    expect(error?.code).toBe(refused);
    expect(await readViews(deck.id)).toEqual([]);
  });
});

describe("deck_views update and delete", () => {
  it("deck_views update: no API role can update a row", async () => {
    const deck = await readyDeck();
    await recordView(deck.id, world.studentA.id, 1);
    const before = await readViews(deck.id);
    const changes = [{ viewed_at: "2020-01-01T00:00:00Z" }, { slide_no: 2 }, { student_id: world.studentB.id }, { deck_id: foreignDeck.id }];
    for (const client of [world.studentA.client, world.studentB.client, world.teacher.client, world.otherTeacher.client, anon]) {
      for (const change of changes) {
        const { error } = await client.from("deck_views").update(change).eq("deck_id", deck.id);
        expect(error?.code).toBe(refused);
      }
    }
    expect(await readViews(deck.id)).toEqual(before);
  });

  it("deck_views delete: no API role can delete a row", async () => {
    const deck = await readyDeck();
    await recordView(deck.id, world.studentA.id, 1);
    const before = await readViews(deck.id);
    for (const client of [world.studentA.client, world.studentB.client, world.teacher.client, world.otherTeacher.client, anon]) {
      const { error } = await client.from("deck_views").delete().eq("deck_id", deck.id);
      expect(error?.code).toBe(refused);
    }
    expect(await readViews(deck.id)).toEqual(before);
  });
});

describe("deck_views select", () => {
  it("deck_views select: a student reads own rows and never a classmate's", async () => {
    const deck = await readyDeck();
    await recordView(deck.id, world.studentA.id, 1);
    await recordView(deck.id, world.studentA.id, 2);
    await recordView(deck.id, world.studentB.id, 3);
    const own = await readAs(world.studentA.client, deck.id);
    expect(own.error).toBeNull();
    expect(own.data).toEqual([
      { deck_id: deck.id, student_id: world.studentA.id, slide_no: 1 },
      { deck_id: deck.id, student_id: world.studentA.id, slide_no: 2 },
    ]);
    const everything = await world.studentA.client.from("deck_views").select("student_id");
    expect(everything.data!.length).toBeGreaterThan(0);
    expect(everything.data!.every((row) => row.student_id === world.studentA.id)).toBe(true);
    const classmate = await world.studentA.client.from("deck_views").select("slide_no").eq("student_id", world.studentB.id);
    expect(classmate.data).toEqual([]);
    const asClassmate = await readAs(world.studentB.client, deck.id);
    expect(asClassmate.data).toEqual([{ deck_id: deck.id, student_id: world.studentB.id, slide_no: 3 }]);
  });

  it("deck_views select: the class teacher reads every row of the deck", async () => {
    const deck = await readyDeck();
    await recordView(deck.id, world.studentA.id, 1);
    await recordView(deck.id, world.studentB.id, 2);
    const { data, error } = await readAs(world.teacher.client, deck.id);
    expect(error).toBeNull();
    expect(data).toEqual([
      { deck_id: deck.id, student_id: world.studentA.id, slide_no: 1 },
      { deck_id: deck.id, student_id: world.studentB.id, slide_no: 2 },
    ]);
  });

  it("deck_views select: another teacher, a student of another class and the outsider read nothing", async () => {
    const deck = await readyDeck();
    await recordView(deck.id, world.studentA.id, 1);
    for (const actor of [world.otherTeacher, world.otherStudent, world.outsider]) {
      const { data, error } = await readAs(actor.client, deck.id);
      expect(error).toBeNull();
      expect(data).toEqual([]);
    }
  });

  it("deck_views select: anon is refused", async () => {
    const { data, error } = await anon.from("deck_views").select("deck_id");
    expect(error?.code).toBe(refused);
    expect(data).toBeNull();
  });

  it("deck_views select: a student stops reading own rows when the deck's lesson is unpublished and the teacher still reads them", async () => {
    const lesson = await addLesson(shared.id, `Lesson ${randomUUID().slice(0, 8)}`, true);
    const deck = await addDeck(world.classroom.id, world.teacher.id, { lessonId: lesson.id });
    await recordView(deck.id, world.studentA.id, 1);
    expect((await readAs(world.studentA.client, deck.id)).data).toHaveLength(1);
    await setPublished(lesson.id, false);
    const asStudent = await readAs(world.studentA.client, deck.id);
    expect(asStudent.error).toBeNull();
    expect(asStudent.data).toEqual([]);
    expect((await readAs(world.teacher.client, deck.id)).data).toHaveLength(1);
  });

  it("deck_views select: a student removed from the class no longer reads own rows", async () => {
    const classroom = await createClass(world.teacher.id, "Roster changes");
    await enroll(classroom.id, world.studentA.id);
    await enroll(classroom.id, world.studentB.id);
    const deck = await addDeck(classroom.id, world.teacher.id);
    expect((await view(world.studentB, deck.id, 1)).error).toBeNull();
    await recordView(deck.id, world.studentA.id, 1);
    expect((await readAs(world.studentB.client, deck.id)).data).toHaveLength(1);
    const removed = await admin.from("enrollments").delete().eq("class_id", classroom.id).eq("student_id", world.studentB.id).select("student_id");
    expect(removed.data).toHaveLength(1);
    const asRemoved = await readAs(world.studentB.client, deck.id);
    expect(asRemoved.error).toBeNull();
    expect(asRemoved.data).toEqual([]);
    expect((await view(world.studentB, deck.id, 2)).error?.code).toBe(refused);
    expect((await readAs(world.studentA.client, deck.id)).data).toHaveLength(1);
    expect(await readViews(deck.id)).toHaveLength(2);
  });
});

describe("deck_views cascade", () => {
  it("deck_views cascade: deleting the deck removes its view rows", async () => {
    const deck = await readyDeck();
    const kept = await readyDeck();
    await recordView(deck.id, world.studentA.id, 1);
    await recordView(deck.id, world.studentB.id, 2);
    await recordView(kept.id, world.studentA.id, 1);
    const { error } = await admin.from("decks").delete().eq("id", deck.id);
    expect(error).toBeNull();
    expect(await readViews(deck.id)).toEqual([]);
    expect(await readViews(kept.id)).toHaveLength(1);
  });
});
