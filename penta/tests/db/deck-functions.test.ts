import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { deckLimits, deckUpload, megabyte, storagePlan } from "../../src/lib/config";
import { buildPdf, buildPptx } from "../fixtures/deck-files";
import {
  addDeck,
  addLesson,
  addModule,
  addUnfinishedDeck,
  admin,
  anon,
  checkFailed,
  countDecks,
  createActor,
  createClass,
  createRouteWorld,
  deckPaths,
  pptxType,
  readDeck,
  readUsage,
  refused,
  removeCreatedUsers,
  removeDecks,
  storeDeckFile,
  type Actor,
  type Client,
  type ReserveResult,
} from "./helpers";

type Classroom = Awaited<ReturnType<typeof createClass>>;
type ReserveArgs = {
  target_class: string;
  deck_title: string;
  deck_kind: string;
  target_lesson: string | null;
  declared_bytes: number;
};

const largestPdf = deckUpload.maxBytes;
const largestDeck = 100 * megabyte;
const hoursAgo = (hours: number) => new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();

let world: Awaited<ReturnType<typeof createRouteWorld>>;
let filler: Actor;
let fillerClassroom: Classroom;
let ownLesson: Awaited<ReturnType<typeof addLesson>>;
let foreignLesson: Awaited<ReturnType<typeof addLesson>>;
const extraClassIds: string[] = [];

async function reserve(client: Client, change: Partial<ReserveArgs> = {}) {
  const args: ReserveArgs = {
    target_class: world.classroom.id,
    deck_title: "Week 1 slides",
    deck_kind: "pdf",
    target_lesson: null,
    declared_bytes: 2048,
    ...change,
  };
  const { data, error } = await client.rpc("reserve_deck", args as never);
  return { result: data as ReserveResult | null, error };
}

function complete(client: Client, deckId: string, realBytes: number, slides: number) {
  return client.rpc("complete_deck", { target_deck: deckId, real_bytes: realBytes, slides });
}

async function usageNow() {
  const { usage, error } = await readUsage(world.teacher.client);
  if (error || !usage) throw new Error("storage_usage returned nothing for a teacher");
  return usage;
}

async function freeNow(): Promise<number> {
  const usage = await usageNow();
  return usage.budget_bytes - usage.used_bytes - usage.reserved_bytes;
}

async function leaveFree(bytes: number) {
  let toFill = (await freeNow()) - bytes;
  if (toFill < 0) throw new Error("the deck pool is already fuller than this test needs");
  while (toFill > 0) {
    const sizeBytes = Math.min(toFill, largestDeck);
    await addUnfinishedDeck(fillerClassroom.id, filler.id, { sizeBytes });
    toFill -= sizeBytes;
  }
  expect(await freeNow()).toBe(bytes);
}

async function extraClass(teacherId: string, title: string) {
  const classroom = await createClass(teacherId, title);
  extraClassIds.push(classroom.id);
  return classroom;
}

beforeAll(async () => {
  [world, filler] = await Promise.all([createRouteWorld(), createActor("filler-teacher", "teacher")]);
  fillerClassroom = await createClass(filler.id, "Pool filler");
  ownLesson = await addLesson((await addModule(world.classroom.id, "Week 1")).id, "Own lesson");
  foreignLesson = await addLesson((await addModule(world.otherClassroom.id, "Their week 1")).id, "Their lesson", true);
});

afterEach(async () => {
  await removeDecks([world.classroom.id, world.otherClassroom.id, fillerClassroom.id, ...extraClassIds]);
});

afterAll(removeCreatedUsers);

describe("reserve_deck", () => {
  it("reserve_deck: the class teacher reserves a pdf deck and gets an unfinished row built from the ids", async () => {
    const { result, error } = await reserve(world.teacher.client, { declared_bytes: 4096 });
    expect(error).toBeNull();
    expect(result).toEqual({ status: "reserved", deck_id: expect.any(String) });
    const row = await readDeck(result!.deck_id!);
    expect(row).toMatchObject({
      id: result!.deck_id,
      class_id: world.classroom.id,
      lesson_id: null,
      title: "Week 1 slides",
      kind: "pdf",
      pdf_path: `${world.classroom.id}/${result!.deck_id}/slides.pdf`,
      original_path: null,
      slide_count: null,
      size_bytes: 4096,
      created_by: world.teacher.id,
      ready_at: null,
    });
    expect(Math.abs(Date.now() - new Date(row!.created_at).getTime())).toBeLessThan(60_000);
  });

  it("reserve_deck: a native deck gets an original path and a lesson of the class can be linked", async () => {
    const { result } = await reserve(world.teacher.client, { deck_kind: "native", target_lesson: ownLesson.id });
    expect(result?.status).toBe("reserved");
    expect(await readDeck(result!.deck_id!)).toMatchObject({
      kind: "native",
      lesson_id: ownLesson.id,
      ...deckPaths(world.classroom.id, result!.deck_id!, "native"),
      ready_at: null,
    });
  });

  it("reserve_deck: the reserved row is hidden from students until it is completed", async () => {
    const { result } = await reserve(world.teacher.client);
    const read = () => world.studentA.client.from("decks").select("id").eq("id", result!.deck_id!);
    expect((await read()).data).toEqual([]);
    expect((await complete(admin, result!.deck_id!, 2048, 4)).data).toBe("ready");
    expect((await read()).data).toEqual([{ id: result!.deck_id }]);
  });

  it("reserve_deck: a student, another teacher and the outsider are refused", async () => {
    for (const actor of [world.studentA, world.otherTeacher, world.otherStudent, world.outsider]) {
      const { result, error } = await reserve(actor.client);
      expect(error).toBeNull();
      expect(result).toEqual({ status: "refused" });
      const withBadInput = await reserve(actor.client, { deck_kind: "html", declared_bytes: 0 });
      expect(withBadInput.result).toEqual({ status: "refused" });
    }
    const missingClass = await reserve(world.teacher.client, { target_class: randomUUID() });
    expect(missingClass.result).toEqual({ status: "refused" });
    expect(await countDecks(world.classroom.id)).toBe(0);
  });

  it("reserve_deck: anon cannot call it and a caller with no user is signed_out", async () => {
    const asAnon = await reserve(anon);
    expect(asAnon.error?.code).toBe(refused);
    expect(asAnon.result).toBeNull();
    const asService = await reserve(admin);
    expect(asService.error).toBeNull();
    expect(asService.result).toEqual({ status: "signed_out" });
    expect(await countDecks(world.classroom.id)).toBe(0);
  });

  it("reserve_deck: a kind outside pdf and native gives bad_kind", async () => {
    for (const deck_kind of ["pptx", "PDF", "", "html"]) {
      expect((await reserve(world.teacher.client, { deck_kind })).result).toEqual({ status: "bad_kind" });
    }
    expect(await countDecks(world.classroom.id)).toBe(0);
  });

  it("reserve_deck: 0 bytes, a pdf above 50 MB and a native deck above 100 MB give too_large", async () => {
    const cases: Partial<ReserveArgs>[] = [
      { declared_bytes: 0 },
      { declared_bytes: -1 },
      { deck_kind: "pdf", declared_bytes: largestPdf + 1 },
      { deck_kind: "native", declared_bytes: largestDeck + 1 },
    ];
    for (const change of cases) {
      expect((await reserve(world.teacher.client, change)).result).toEqual({ status: "too_large" });
    }
    expect(await countDecks(world.classroom.id)).toBe(0);
  });

  it("reserve_deck: exactly 50 MB for a pdf and 100 MB for a native deck are accepted", async () => {
    expect(await freeNow()).toBeGreaterThan(largestPdf + largestDeck);
    const pdf = await reserve(world.teacher.client, { deck_kind: "pdf", declared_bytes: largestPdf });
    expect(pdf.result?.status).toBe("reserved");
    const native = await reserve(world.teacher.client, { deck_kind: "native", declared_bytes: largestDeck });
    expect(native.result?.status).toBe("reserved");
  });

  it("reserve_deck: a lesson of another class or a missing lesson gives bad_lesson", async () => {
    for (const target_lesson of [foreignLesson.id, randomUUID()]) {
      expect((await reserve(world.teacher.client, { target_lesson })).result).toEqual({ status: "bad_lesson" });
    }
    expect(await countDecks(world.classroom.id)).toBe(0);
  });

  it("reserve_deck: a bad title raises 23514 and leaves no row", async () => {
    for (const deck_title of ["", " padded ", "x".repeat(121), "Hidden​character"]) {
      const { result, error } = await reserve(world.teacher.client, { deck_title });
      expect(error?.code).toBe(checkFailed);
      expect(result).toBeNull();
    }
    expect(await countDecks(world.classroom.id)).toBe(0);
    expect((await reserve(world.teacher.client, { deck_title: "x".repeat(120) })).result?.status).toBe("reserved");
  });

  it("reserve_deck: the fourth unfinished deck of one teacher gives pending_limit, across classes", async () => {
    const second = await extraClass(world.teacher.id, "Second class");
    expect(deckLimits.unfinishedPerTeacher).toBe(3);
    const first = await reserve(world.teacher.client);
    expect(first.result?.status).toBe("reserved");
    expect((await reserve(world.teacher.client)).result?.status).toBe("reserved");
    expect((await reserve(world.teacher.client, { target_class: second.id })).result?.status).toBe("reserved");
    expect((await reserve(world.teacher.client)).result).toEqual({ status: "pending_limit" });
    expect((await reserve(world.teacher.client, { target_class: second.id })).result).toEqual({ status: "pending_limit" });
    const other = await reserve(world.otherTeacher.client, { target_class: world.otherClassroom.id });
    expect(other.result?.status).toBe("reserved");
    expect((await complete(admin, first.result!.deck_id!, 2048, 3)).data).toBe("ready");
    expect((await reserve(world.teacher.client)).result?.status).toBe("reserved");
    expect((await reserve(world.teacher.client)).result).toEqual({ status: "pending_limit" });
  });

  it("reserve_deck: the 41st deck in a class gives deck_limit", async () => {
    const crowded = await extraClass(world.teacher.id, "Crowded class");
    expect(deckLimits.decksPerClass).toBe(40);
    for (let added = 0; added < 39; added += 1) await addDeck(crowded.id, world.teacher.id, { sizeBytes: 1 });
    const fortieth = await reserve(world.teacher.client, { target_class: crowded.id });
    expect(fortieth.result?.status).toBe("reserved");
    expect((await reserve(world.teacher.client, { target_class: crowded.id })).result).toEqual({ status: "deck_limit" });
    expect(await countDecks(crowded.id)).toBe(40);
    expect((await reserve(world.teacher.client)).result?.status).toBe("reserved");
  });

  it("reserve_deck: a declared size that does not fit gives full with the free bytes", async () => {
    await leaveFree(1000);
    const tooBig = await reserve(world.teacher.client, { declared_bytes: 1001 });
    expect(tooBig.error).toBeNull();
    expect(tooBig.result).toEqual({ status: "full", free_bytes: 1000 });
    expect(await countDecks(world.classroom.id)).toBe(0);
    const fits = await reserve(world.teacher.client, { declared_bytes: 1000 });
    expect(fits.result?.status).toBe("reserved");
    expect((await reserve(world.teacher.client, { declared_bytes: 1 })).result).toEqual({ status: "full", free_bytes: 0 });
  });

  it("reserve_deck: free_bytes is never negative when the pool is over the budget", async () => {
    await leaveFree(0);
    await addUnfinishedDeck(fillerClassroom.id, filler.id, { sizeBytes: 5000 });
    expect((await reserve(world.teacher.client, { declared_bytes: 1 })).result).toEqual({ status: "full", free_bytes: 0 });
  });

  it("reserve_deck: two reserves at once that together exceed the free space give exactly one reserved", async () => {
    await leaveFree(1000);
    const results = await Promise.all([
      reserve(world.teacher.client, { declared_bytes: 600 }),
      reserve(world.otherTeacher.client, { target_class: world.otherClassroom.id, declared_bytes: 600 }),
    ]);
    expect(results.map(({ error }) => error)).toEqual([null, null]);
    expect(results.map(({ result }) => result?.status).sort()).toEqual(["full", "reserved"]);
    expect(results.find(({ result }) => result?.status === "full")?.result).toEqual({ status: "full", free_bytes: 400 });
    expect(await freeNow()).toBe(400);
  });

  it("reserve_deck: four reserves at once by one teacher never pass the pending limit", async () => {
    const results = await Promise.all([1, 2, 3, 4].map(() => reserve(world.teacher.client)));
    expect(results.map(({ result }) => result?.status).sort()).toEqual(["pending_limit", "reserved", "reserved", "reserved"]);
    expect(await countDecks(world.classroom.id)).toBe(3);
  });
});

describe("deck budget", () => {
  it("deck budget: the budget in SQL equals the budget in the config", async () => {
    const usage = await usageNow();
    expect(usage.budget_bytes).toBe(deckLimits.budgetBytes);
    expect(usage.budget_bytes).toBe(700 * megabyte);
  });
});

describe("complete_deck", () => {
  it("complete_deck: no API role can call it", async () => {
    const deck = await addUnfinishedDeck(world.classroom.id, world.teacher.id);
    for (const client of [world.teacher.client, world.otherTeacher.client, world.studentA.client, anon]) {
      const { data, error } = await complete(client, deck.id, 500, 3);
      expect(error?.code).toBe(refused);
      expect(data).toBeNull();
    }
    expect(await readDeck(deck.id)).toEqual(deck);
  });

  it("complete_deck: the service role makes a deck ready with the real size and the slide count", async () => {
    const deck = await addUnfinishedDeck(world.classroom.id, world.teacher.id, { sizeBytes: 5000 });
    const { data, error } = await complete(admin, deck.id, 4000, 12);
    expect(error).toBeNull();
    expect(data).toBe("ready");
    const row = await readDeck(deck.id);
    expect(row).toEqual({ ...deck, size_bytes: 4000, slide_count: 12, ready_at: expect.any(String) });
    expect(Math.abs(Date.now() - new Date(row!.ready_at!).getTime())).toBeLessThan(60_000);
  });

  it("complete_deck: a real size equal to the declared one and the slide counts 1 and 300 are accepted", async () => {
    for (const slides of [1, 300]) {
      const deck = await addUnfinishedDeck(world.classroom.id, world.teacher.id, { sizeBytes: 5000 });
      expect((await complete(admin, deck.id, 5000, slides)).data).toBe("ready");
      expect(await readDeck(deck.id)).toMatchObject({ size_bytes: 5000, slide_count: slides });
    }
  });

  it("complete_deck: a second call gives not_pending and changes nothing", async () => {
    const deck = await addUnfinishedDeck(world.classroom.id, world.teacher.id, { sizeBytes: 5000 });
    expect((await complete(admin, deck.id, 4000, 12)).data).toBe("ready");
    const afterFirst = await readDeck(deck.id);
    const second = await complete(admin, deck.id, 3000, 7);
    expect(second.error).toBeNull();
    expect(second.data).toBe("not_pending");
    expect(await readDeck(deck.id)).toEqual(afterFirst);
    expect((await complete(admin, randomUUID(), 3000, 7)).data).toBe("not_pending");
  });

  it("complete_deck: a real size above the declared one gives larger_than_declared and the deck stays unfinished", async () => {
    const deck = await addUnfinishedDeck(world.classroom.id, world.teacher.id, { sizeBytes: 5000 });
    for (const realBytes of [5001, largestDeck, 0, -1]) {
      const { data, error } = await complete(admin, deck.id, realBytes, 12);
      expect(error).toBeNull();
      expect(data).toBe("larger_than_declared");
    }
    expect(await readDeck(deck.id)).toEqual(deck);
  });

  it("complete_deck: slide counts 0 and 301 give bad_slide_count and the deck stays unfinished", async () => {
    const deck = await addUnfinishedDeck(world.classroom.id, world.teacher.id, { sizeBytes: 5000 });
    for (const slides of [0, -1, 301]) {
      const { data, error } = await complete(admin, deck.id, 4000, slides);
      expect(error).toBeNull();
      expect(data).toBe("bad_slide_count");
    }
    expect(await readDeck(deck.id)).toEqual(deck);
  });

  it("complete_deck: two calls at once make the deck ready exactly once", async () => {
    const deck = await addUnfinishedDeck(world.classroom.id, world.teacher.id, { sizeBytes: 5000 });
    const results = await Promise.all([complete(admin, deck.id, 4000, 12), complete(admin, deck.id, 3000, 7)]);
    expect(results.map(({ data }) => data).sort()).toEqual(["not_pending", "ready"]);
  });
});

describe("storage_usage", () => {
  it("storage_usage: a teacher gets the three numbers", async () => {
    for (const teacher of [world.teacher, world.otherTeacher]) {
      const { usage, error } = await readUsage(teacher.client);
      expect(error).toBeNull();
      expect(usage).toEqual({
        used_bytes: expect.any(Number),
        reserved_bytes: expect.any(Number),
        budget_bytes: deckLimits.budgetBytes,
        submission_bytes: expect.any(Number),
        total_bytes: expect.any(Number),
        block_bytes: storagePlan.blockBytes,
      });
      expect(usage!.used_bytes).toBeGreaterThanOrEqual(0);
      expect(usage!.reserved_bytes).toBeGreaterThanOrEqual(0);
    }
  });

  it("storage_usage: a student gets null and anon cannot call it", async () => {
    for (const student of [world.studentA, world.outsider]) {
      const { usage, error } = await readUsage(student.client);
      expect(error).toBeNull();
      expect(usage).toBeNull();
    }
    const asAnon = await readUsage(anon);
    expect(asAnon.error?.code).toBe(refused);
    expect(asAnon.usage).toBeNull();
  });

  it("storage_usage: used_bytes grows by the size of a stored object", async () => {
    const before = await usageNow();
    const deck = await addDeck(world.classroom.id, world.teacher.id, { kind: "native" });
    const pdf = buildPdf(3, 2000);
    const pptx = buildPptx();
    await storeDeckFile(deck.pdf_path, pdf);
    expect(await usageNow()).toMatchObject({ used_bytes: before.used_bytes + pdf.length });
    await storeDeckFile(deck.original_path!, pptx, pptxType);
    expect(await usageNow()).toMatchObject({ used_bytes: before.used_bytes + pdf.length + pptx.length });
    await removeDecks([world.classroom.id]);
    expect(await usageNow()).toEqual(before);
  });

  it("storage_usage: reserved_bytes grows by an unfinished row and not by a ready one", async () => {
    const before = await usageNow();
    await addDeck(world.classroom.id, world.teacher.id, { sizeBytes: 7000 });
    expect(await usageNow()).toEqual(before);
    const unfinished = await addUnfinishedDeck(world.classroom.id, world.teacher.id, { sizeBytes: 4321 });
    expect(await usageNow()).toEqual({ ...before, reserved_bytes: before.reserved_bytes + 4321 });
    const reserved = await reserve(world.teacher.client, { declared_bytes: 1111 });
    expect(reserved.result?.status).toBe("reserved");
    expect(await usageNow()).toEqual({ ...before, reserved_bytes: before.reserved_bytes + 4321 + 1111 });
    expect((await complete(admin, unfinished.id, 4000, 2)).data).toBe("ready");
    expect(await usageNow()).toEqual({ ...before, reserved_bytes: before.reserved_bytes + 1111 });
  });
});

describe("sweep_decks", () => {
  it("sweep_decks: no API role can call it", async () => {
    const stale = await addUnfinishedDeck(world.classroom.id, world.teacher.id);
    await admin.from("decks").update({ created_at: hoursAgo(7) }).eq("id", stale.id);
    for (const client of [world.teacher.client, world.otherTeacher.client, world.studentA.client, anon]) {
      const { data, error } = await client.rpc("sweep_decks");
      expect(error?.code).toBe(refused);
      expect(data).toBeNull();
    }
    expect(await readDeck(stale.id)).not.toBeNull();
  });

  it("sweep_decks: it returns an object that has no deck row and not one that has", async () => {
    const orphan = `${world.classroom.id}/${randomUUID()}/slides.pdf`;
    const strayOriginal = `${world.classroom.id}/${randomUUID()}/original.pptx`;
    const ready = await addDeck(world.classroom.id, world.teacher.id, { kind: "native" });
    const unfinished = await addUnfinishedDeck(world.classroom.id, world.teacher.id);
    await storeDeckFile(orphan, buildPdf(1));
    await storeDeckFile(strayOriginal, buildPptx(), pptxType);
    await storeDeckFile(ready.pdf_path, buildPdf(1));
    await storeDeckFile(ready.original_path!, buildPptx(), pptxType);
    await storeDeckFile(unfinished.pdf_path, buildPdf(1));
    const { data, error } = await admin.rpc("sweep_decks");
    expect(error).toBeNull();
    expect(data).toContain(orphan);
    expect(data).toContain(strayOriginal);
    expect(data).not.toContain(ready.pdf_path);
    expect(data).not.toContain(ready.original_path);
    expect(data).not.toContain(unfinished.pdf_path);
  });

  it("sweep_decks: an object becomes an orphan once its deck row is deleted", async () => {
    const deck = await addDeck(world.classroom.id, world.teacher.id);
    await storeDeckFile(deck.pdf_path, buildPdf(1));
    expect((await admin.rpc("sweep_decks")).data).not.toContain(deck.pdf_path);
    await admin.from("decks").delete().eq("id", deck.id);
    expect((await admin.rpc("sweep_decks")).data).toContain(deck.pdf_path);
  });

  it("sweep_decks: it deletes an unfinished deck older than 6 hours and keeps a fresh one and a ready old one", async () => {
    const stale = await addUnfinishedDeck(world.classroom.id, world.teacher.id);
    const recent = await addUnfinishedDeck(world.classroom.id, world.teacher.id);
    const fresh = await addUnfinishedDeck(world.classroom.id, world.teacher.id);
    const readyOld = await addDeck(world.classroom.id, world.teacher.id);
    await storeDeckFile(stale.pdf_path, buildPdf(1));
    await admin.from("decks").update({ created_at: hoursAgo(7) }).eq("id", stale.id);
    await admin.from("decks").update({ created_at: hoursAgo(5) }).eq("id", recent.id);
    await admin.from("decks").update({ created_at: hoursAgo(7) }).eq("id", readyOld.id);
    const { data, error } = await admin.rpc("sweep_decks");
    expect(error).toBeNull();
    expect(await readDeck(stale.id)).toBeNull();
    expect(await readDeck(recent.id)).not.toBeNull();
    expect(await readDeck(fresh.id)).not.toBeNull();
    expect(await readDeck(readyOld.id)).not.toBeNull();
    expect(data).toContain(stale.pdf_path);
  });

  it("sweep_decks: a swept reservation frees its bytes and its pending slot", async () => {
    const before = await usageNow();
    for (let added = 0; added < 3; added += 1) expect((await reserve(world.teacher.client)).result?.status).toBe("reserved");
    expect((await reserve(world.teacher.client)).result).toEqual({ status: "pending_limit" });
    await admin.from("decks").update({ created_at: hoursAgo(7) }).eq("created_by", world.teacher.id).is("ready_at", null);
    expect((await admin.rpc("sweep_decks")).error).toBeNull();
    expect((await usageNow()).reserved_bytes).toBe(before.reserved_bytes);
    expect((await reserve(world.teacher.client)).result?.status).toBe("reserved");
  });
});
