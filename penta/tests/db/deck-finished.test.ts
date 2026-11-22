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
  enroll,
  readViews,
  refused,
  removeCreatedUsers,
  setPublished,
  type Client,
} from "./helpers";

type Deck = Awaited<ReturnType<typeof addDeck>>;

const slideCount = 4;
const longAgo = Date.parse("2026-11-01T01:00:00Z");

let world: Awaited<ReturnType<typeof createRouteWorld>>;
let shared: Awaited<ReturnType<typeof addModule>>;
let finishedDeck: Deck;

function readyDeck(slides = slideCount): Promise<Deck> {
  return addDeck(world.classroom.id, world.teacher.id, { slideCount: slides });
}

async function finished(client: Client, deckId: string, studentId: string) {
  const { data, error } = await client.rpc("deck_finished", { target_deck: deckId, target_student: studentId });
  expect(error).toBeNull();
  return data;
}

async function viewSlides(deckId: string, studentId: string, slides: number[], gapMilliseconds = 1000) {
  const rows = slides.map((slideNo, index) => ({
    deck_id: deckId,
    student_id: studentId,
    slide_no: slideNo,
    viewed_at: new Date(longAgo + index * gapMilliseconds).toISOString(),
  }));
  const { error } = await admin.from("deck_views").insert(rows);
  if (error) throw error;
}

function everySlide(slides = slideCount): number[] {
  return Array.from({ length: slides }, (_, index) => index + 1);
}

beforeAll(async () => {
  world = await createRouteWorld();
  shared = await addModule(world.classroom.id, "Week 1");
  finishedDeck = await readyDeck();
  await viewSlides(finishedDeck.id, world.studentA.id, everySlide());
});

afterAll(removeCreatedUsers);

describe("deck_finished answer", () => {
  it("deck_finished: false with no views", async () => {
    const deck = await readyDeck();
    expect(await finished(world.studentA.client, deck.id, world.studentA.id)).toBe(false);
    expect(await finished(admin, deck.id, world.studentA.id)).toBe(false);
  });

  it("deck_finished: false with all but one slide, whichever slide is missing", async () => {
    for (const missing of [1, 2, slideCount]) {
      const deck = await readyDeck();
      await viewSlides(deck.id, world.studentA.id, everySlide().filter((slideNo) => slideNo !== missing), 5000);
      expect(await finished(world.studentA.client, deck.id, world.studentA.id)).toBe(false);
    }
  });

  it("deck_finished: false with views of another student only", async () => {
    const deck = await readyDeck();
    await viewSlides(deck.id, world.studentB.id, everySlide());
    expect(await finished(world.studentA.client, deck.id, world.studentA.id)).toBe(false);
    expect(await finished(world.studentB.client, deck.id, world.studentB.id)).toBe(true);
  });

  it("deck_finished: false when two students cover every slide between them", async () => {
    const deck = await readyDeck();
    await viewSlides(deck.id, world.studentA.id, [1, 2]);
    await viewSlides(deck.id, world.studentB.id, [3, 4]);
    expect(await finished(world.studentA.client, deck.id, world.studentA.id)).toBe(false);
    expect(await finished(world.studentB.client, deck.id, world.studentB.id)).toBe(false);
  });

  it("deck_finished: true when every slide has a view and the views span one second per slide", async () => {
    expect(await finished(world.studentA.client, finishedDeck.id, world.studentA.id)).toBe(true);
    const deck = await readyDeck();
    await viewSlides(deck.id, world.studentA.id, [3, 1, 4, 2], 60_000);
    expect(await finished(world.studentA.client, deck.id, world.studentA.id)).toBe(true);
  });

  it("deck_finished: false when the views span less than one second per slide", async () => {
    const deck = await readyDeck();
    await viewSlides(deck.id, world.studentA.id, everySlide(), 500);
    expect(await finished(world.studentA.client, deck.id, world.studentA.id)).toBe(false);
    expect(await finished(admin, deck.id, world.studentA.id)).toBe(false);
  });

  it("deck_finished: false when every slide was inserted in one request", async () => {
    const deck = await readyDeck();
    const rows = everySlide().map((slideNo) => ({ deck_id: deck.id, student_id: world.studentA.id, slide_no: slideNo }));
    const { error } = await world.studentA.client.from("deck_views").insert(rows);
    expect(error).toBeNull();
    const stored = await readViews(deck.id);
    expect(stored).toHaveLength(slideCount);
    expect(new Set(stored.map((row) => row.viewed_at)).size).toBe(1);
    expect(await finished(world.studentA.client, deck.id, world.studentA.id)).toBe(false);
    expect(await finished(world.teacher.client, deck.id, world.studentA.id)).toBe(false);
    expect(await finished(admin, deck.id, world.studentA.id)).toBe(false);
  });

  it("deck_finished: false for an unfinished deck and an unknown deck id", async () => {
    const unfinished = await addUnfinishedDeck(world.classroom.id, world.teacher.id);
    for (const client of [world.studentA.client, world.teacher.client, admin]) {
      expect(await finished(client, unfinished.id, world.studentA.id)).toBe(false);
      expect(await finished(client, randomUUID(), world.studentA.id)).toBe(false);
    }
  });

  it("deck_finished: false for a null deck or a null student", async () => {
    expect(await finished(world.studentA.client, null as never, world.studentA.id)).toBe(false);
    expect(await finished(world.teacher.client, finishedDeck.id, null as never)).toBe(false);
    expect(await finished(admin, finishedDeck.id, null as never)).toBe(false);
  });

  it("deck_finished: false for a student once the lesson of the deck is back to draft", async () => {
    const lesson = await addLesson(shared.id, `Lesson ${randomUUID().slice(0, 8)}`, true);
    const deck = await addDeck(world.classroom.id, world.teacher.id, { lessonId: lesson.id, slideCount });
    await viewSlides(deck.id, world.studentA.id, everySlide());
    expect(await finished(world.studentA.client, deck.id, world.studentA.id)).toBe(true);
    await setPublished(lesson.id, false);
    expect(await finished(world.studentA.client, deck.id, world.studentA.id)).toBe(false);
    expect(await finished(world.teacher.client, deck.id, world.studentA.id)).toBe(true);
    expect(await finished(admin, deck.id, world.studentA.id)).toBe(true);
  });
});

describe("deck_finished callers", () => {
  it("deck_finished: the student is answered for own id", async () => {
    expect(await finished(world.studentA.client, finishedDeck.id, world.studentA.id)).toBe(true);
    expect(await finished(world.studentB.client, finishedDeck.id, world.studentB.id)).toBe(false);
  });

  it("deck_finished: a student asking about another student gets false even when that student has finished", async () => {
    expect(await finished(world.studentB.client, finishedDeck.id, world.studentA.id)).toBe(false);
    expect(await finished(world.otherStudent.client, finishedDeck.id, world.studentA.id)).toBe(false);
    expect(await finished(world.outsider.client, finishedDeck.id, world.studentA.id)).toBe(false);
  });

  it("deck_finished: the class teacher asking about an enrolled student gets the real answer", async () => {
    expect(await finished(world.teacher.client, finishedDeck.id, world.studentA.id)).toBe(true);
    expect(await finished(world.teacher.client, finishedDeck.id, world.studentB.id)).toBe(false);
  });

  it("deck_finished: the teacher asking about a student who is not in the class gets false", async () => {
    const classroom = await createClass(world.teacher.id, "Roster changes");
    await enroll(classroom.id, world.studentA.id);
    const deck = await addDeck(classroom.id, world.teacher.id, { slideCount });
    await viewSlides(deck.id, world.studentA.id, everySlide());
    expect(await finished(world.teacher.client, deck.id, world.studentA.id)).toBe(true);
    const removed = await admin.from("enrollments").delete().eq("class_id", classroom.id).eq("student_id", world.studentA.id).select("student_id");
    expect(removed.data).toHaveLength(1);
    expect(await readViews(deck.id)).toHaveLength(slideCount);
    expect(await finished(world.teacher.client, deck.id, world.studentA.id)).toBe(false);
    expect(await finished(world.studentA.client, deck.id, world.studentA.id)).toBe(false);
    expect(await finished(world.teacher.client, finishedDeck.id, world.otherStudent.id)).toBe(false);
    expect(await finished(admin, deck.id, world.studentA.id)).toBe(true);
  });

  it("deck_finished: another teacher gets false", async () => {
    expect(await finished(world.otherTeacher.client, finishedDeck.id, world.studentA.id)).toBe(false);
    expect(await finished(world.otherTeacher.client, finishedDeck.id, world.otherTeacher.id)).toBe(false);
  });

  it("deck_finished: anon cannot call it", async () => {
    const { data, error } = await anon.rpc("deck_finished", { target_deck: finishedDeck.id, target_student: world.studentA.id });
    expect(error?.code).toBe(refused);
    expect(data).toBeNull();
  });

  it("deck_finished: the service role gets the real answer", async () => {
    expect(await finished(admin, finishedDeck.id, world.studentA.id)).toBe(true);
    expect(await finished(admin, finishedDeck.id, world.studentB.id)).toBe(false);
  });
});
