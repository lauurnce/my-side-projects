import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  addDeck,
  addLesson,
  addModule,
  addUnfinishedDeck,
  admin,
  anon,
  checkFailed,
  countDecks,
  deckPaths,
  foreignKeyFailed,
  readDeck,
  refused,
  removeCreatedUsers,
  createRouteWorld,
  setPublished,
  type Actor,
  type Client,
} from "./helpers";

type Deck = Awaited<ReturnType<typeof addDeck>>;
type Lesson = Awaited<ReturnType<typeof addLesson>>;

let world: Awaited<ReturnType<typeof createRouteWorld>>;
let shared: Awaited<ReturnType<typeof addModule>>;
let draft: Lesson;
let published: Lesson;
let foreignLesson: Lesson;
let ready: Deck;
let unfinished: Deck;
let onDraft: Deck;
let onPublished: Deck;
let foreignDeck: Deck;

function idsSeenBy(client: Client, classId: string) {
  return client.from("decks").select("id").eq("class_id", classId);
}

function sharedSeenBy(client: Client) {
  return client
    .from("decks")
    .select("id")
    .in("id", [ready.id, unfinished.id, onDraft.id, onPublished.id, foreignDeck.id]);
}

function fullRow(classId: string, createdBy: string) {
  const id = randomUUID();
  return {
    id,
    class_id: classId,
    title: "Slipped in",
    kind: "pdf",
    ...deckPaths(classId, id),
    size_bytes: 1024,
    created_by: createdBy,
  };
}

function adminInsert(change: Record<string, unknown>) {
  return admin.from("decks").insert({ ...fullRow(world.classroom.id, world.teacher.id), ...change } as never);
}

async function expectSharedDecksUnchanged() {
  for (const deck of [ready, unfinished, onDraft, onPublished, foreignDeck]) expect(await readDeck(deck.id)).toEqual(deck);
}

beforeAll(async () => {
  world = await createRouteWorld();
  shared = await addModule(world.classroom.id, "Week 1");
  draft = await addLesson(shared.id, "Draft lesson");
  published = await addLesson(shared.id, "Published lesson", true);
  foreignLesson = await addLesson((await addModule(world.otherClassroom.id, "Their week 1")).id, "Their lesson", true);
  ready = await addDeck(world.classroom.id, world.teacher.id, { title: "Ready deck" });
  unfinished = await addUnfinishedDeck(world.classroom.id, world.teacher.id, { title: "Unfinished deck" });
  onDraft = await addDeck(world.classroom.id, world.teacher.id, { title: "On a draft", lessonId: draft.id });
  onPublished = await addDeck(world.classroom.id, world.teacher.id, { title: "On a published lesson", lessonId: published.id });
  foreignDeck = await addDeck(world.otherClassroom.id, world.otherTeacher.id, { title: "Their deck" });
});

afterAll(removeCreatedUsers);

describe("decks select", () => {
  it("decks select: the class teacher reads every deck of the class, unfinished ones too", async () => {
    const { data, error } = await sharedSeenBy(world.teacher.client);
    expect(error).toBeNull();
    expect(data?.map((row) => row.id).sort()).toEqual([ready.id, unfinished.id, onDraft.id, onPublished.id].sort());
    const whole = await idsSeenBy(world.teacher.client, world.classroom.id);
    expect(whole.data).toHaveLength(await countDecks(world.classroom.id));
  });

  it("decks select: the teacher reads only decks of own classes", async () => {
    const { data, error } = await world.teacher.client.from("decks").select("class_id");
    expect(error).toBeNull();
    expect(data!.every((row) => row.class_id === world.classroom.id)).toBe(true);
  });

  it("decks select: another teacher sees none of the class", async () => {
    const { data, error } = await idsSeenBy(world.otherTeacher.client, world.classroom.id);
    expect(error).toBeNull();
    expect(data).toEqual([]);
    const all = await world.otherTeacher.client.from("decks").select("id");
    expect(all.data).toEqual([{ id: foreignDeck.id }]);
  });

  it("decks select: an enrolled student sees ready decks with no lesson or a published lesson, and nothing else", async () => {
    for (const student of [world.studentA, world.studentB]) {
      const { data, error } = await sharedSeenBy(student.client);
      expect(error).toBeNull();
      expect(data?.map((row) => row.id).sort()).toEqual([ready.id, onPublished.id].sort());
    }
  });

  it("decks select: a student cannot read an unfinished deck or a deck on a draft lesson by id", async () => {
    for (const deck of [unfinished, onDraft, foreignDeck]) {
      const { data, error } = await world.studentA.client.from("decks").select("id, pdf_path").eq("id", deck.id);
      expect(error).toBeNull();
      expect(data).toEqual([]);
    }
    const byId = await world.studentA.client.from("decks").select("id").eq("id", ready.id);
    expect(byId.data).toEqual([{ id: ready.id }]);
  });

  it("decks select: a deck on a draft lesson appears once the lesson is published and hides again when unpublished", async () => {
    const lesson = await addLesson(shared.id, "Published later");
    const deck = await addDeck(world.classroom.id, world.teacher.id, { lessonId: lesson.id });
    const read = () => world.studentA.client.from("decks").select("id").eq("id", deck.id);
    expect((await read()).data).toEqual([]);
    await setPublished(lesson.id, true);
    expect((await read()).data).toEqual([{ id: deck.id }]);
    await setPublished(lesson.id, false);
    expect((await read()).data).toEqual([]);
  });

  it("decks select: an unfinished deck appears to the student once it is ready", async () => {
    const deck = await addUnfinishedDeck(world.classroom.id, world.teacher.id);
    const read = () => world.studentB.client.from("decks").select("id").eq("id", deck.id);
    expect((await read()).data).toEqual([]);
    const { data } = await admin.rpc("complete_deck", { target_deck: deck.id, real_bytes: 900, slides: 3 });
    expect(data).toBe("ready");
    expect((await read()).data).toEqual([{ id: deck.id }]);
  });

  it("decks select: a student of another class, the outsider and anon see none of the class", async () => {
    for (const actor of [world.otherStudent, world.outsider]) {
      const { data, error } = await idsSeenBy(actor.client, world.classroom.id);
      expect(error).toBeNull();
      expect(data).toEqual([]);
      const byId = await actor.client.from("decks").select("id, pdf_path").eq("id", ready.id);
      expect(byId.data).toEqual([]);
    }
    const asAnon = await anon.from("decks").select("id");
    expect(asAnon.error?.code).toBe(refused);
    expect(asAnon.data).toBeNull();
    const anonById = await anon.from("decks").select("id").eq("id", ready.id);
    expect(anonById.error?.code).toBe(refused);
  });

  it("decks select: a student removed from the class no longer reads its decks", async () => {
    const { error } = await admin.from("enrollments").insert({ class_id: world.classroom.id, student_id: world.outsider.id });
    expect(error).toBeNull();
    const whileEnrolled = await sharedSeenBy(world.outsider.client);
    expect(whileEnrolled.data?.map((row) => row.id).sort()).toEqual([ready.id, onPublished.id].sort());
    await admin.from("enrollments").delete().eq("class_id", world.classroom.id).eq("student_id", world.outsider.id);
    expect((await idsSeenBy(world.outsider.client, world.classroom.id)).data).toEqual([]);
  });
});

describe("decks insert", () => {
  it("decks insert: no API role can insert a deck, with a full row or a short one", async () => {
    const before = await countDecks(world.classroom.id);
    const callers: [Client, string][] = [
      [world.teacher.client, world.teacher.id],
      [world.otherTeacher.client, world.otherTeacher.id],
      [world.studentA.client, world.studentA.id],
      [anon, world.teacher.id],
    ];
    for (const [client, createdBy] of callers) {
      const full = fullRow(world.classroom.id, createdBy);
      const rows: Record<string, unknown>[] = [
        full,
        { ...full, slide_count: 5, ready_at: new Date().toISOString() },
        { class_id: world.classroom.id, title: "Short" },
        { title: "Title only" },
        {},
      ];
      for (const row of rows) {
        const { error } = await client.from("decks").insert(row as never);
        expect(error?.code).toBe(refused);
      }
      const upserted = await client.from("decks").upsert(full as never, { onConflict: "id" });
      expect(upserted.error?.code).toBe(refused);
    }
    expect(await countDecks(world.classroom.id)).toBe(before);
  });
});

describe("decks delete", () => {
  it("decks delete: no API role can delete a deck", async () => {
    for (const client of [world.teacher.client, world.otherTeacher.client, world.studentA.client, anon]) {
      const aimed = await client.from("decks").delete().eq("id", ready.id);
      expect(aimed.error?.code).toBe(refused);
      const wide = await client.from("decks").delete().eq("class_id", world.classroom.id);
      expect(wide.error?.code).toBe(refused);
    }
    await expectSharedDecksUnchanged();
  });
});

describe("decks update", () => {
  it("decks update: the teacher renames a deck and links and unlinks a lesson", async () => {
    const deck = await addDeck(world.classroom.id, world.teacher.id);
    const update = (change: { title?: string; lesson_id?: string | null }) =>
      world.teacher.client.from("decks").update(change).eq("id", deck.id).select("id, title, lesson_id");
    const renamed = await update({ title: "Renamed deck" });
    expect(renamed.error).toBeNull();
    expect(renamed.data).toEqual([{ id: deck.id, title: "Renamed deck", lesson_id: null }]);
    const linked = await update({ lesson_id: draft.id });
    expect(linked.data).toEqual([{ id: deck.id, title: "Renamed deck", lesson_id: draft.id }]);
    const unlinked = await update({ lesson_id: null });
    expect(unlinked.data).toEqual([{ id: deck.id, title: "Renamed deck", lesson_id: null }]);
    expect(await readDeck(deck.id)).toEqual({ ...deck, title: "Renamed deck" });
  });

  it("decks update: the teacher renames an unfinished deck too", async () => {
    const deck = await addUnfinishedDeck(world.classroom.id, world.teacher.id);
    const { data, error } = await world.teacher.client.from("decks").update({ title: "Still loading" }).eq("id", deck.id).select("id");
    expect(error).toBeNull();
    expect(data).toEqual([{ id: deck.id }]);
  });

  it("decks update: the teacher cannot change any other column", async () => {
    const deck = await addDeck(world.classroom.id, world.teacher.id, { kind: "pptx" });
    const moved = deckPaths(world.classroom.id, randomUUID(), "pptx");
    const changes: Record<string, unknown>[] = [
      { size_bytes: 1 },
      { slide_count: 300 },
      { ready_at: null },
      { ready_at: new Date().toISOString() },
      { pdf_path: moved.pdf_path },
      { original_path: moved.original_path },
      { original_path: null },
      { kind: "pdf" },
      { class_id: world.otherClassroom.id },
      { created_by: world.otherTeacher.id },
      { created_at: "2020-01-01T00:00:00Z" },
      { id: randomUUID() },
      { title: "Allowed part", size_bytes: 1 },
    ];
    for (const change of changes) {
      const { error } = await world.teacher.client.from("decks").update(change as never).eq("id", deck.id);
      expect(error?.code).toBe(refused);
    }
    expect(await readDeck(deck.id)).toEqual(deck);
  });

  it("decks update: a bad title is refused by the check", async () => {
    for (const title of ["", " padded ", "x".repeat(121), "Hidden​character", "Line\nbreak"]) {
      const { error } = await world.teacher.client.from("decks").update({ title }).eq("id", ready.id);
      expect(error?.code).toBe(checkFailed);
    }
    const longest = await world.teacher.client.from("decks").update({ title: "x".repeat(120) }).eq("id", unfinished.id).select("id");
    expect(longest.data).toHaveLength(1);
    await admin.from("decks").update({ title: unfinished.title }).eq("id", unfinished.id);
    await expectSharedDecksUnchanged();
  });

  it("decks update: another teacher, students and the outsider change zero rows", async () => {
    const actors: Actor[] = [world.otherTeacher, world.studentA, world.otherStudent, world.outsider];
    for (const actor of actors) {
      for (const deck of [ready, unfinished, onPublished]) {
        const { data, error } = await actor.client.from("decks").update({ title: "Taken over" }).eq("id", deck.id).select("id");
        expect(error).toBeNull();
        expect(data).toEqual([]);
        const relinked = await actor.client.from("decks").update({ lesson_id: null }).eq("id", deck.id).select("id");
        expect(relinked.data).toEqual([]);
      }
    }
    await expectSharedDecksUnchanged();
  });

  it("decks update: a student cannot change a protected column and anon cannot update at all", async () => {
    const protectedChange = await world.studentA.client.from("decks").update({ slide_count: 1 } as never).eq("id", ready.id);
    expect(protectedChange.error?.code).toBe(refused);
    const asAnon = await anon.from("decks").update({ title: "Taken over" }).eq("id", ready.id);
    expect(asAnon.error?.code).toBe(refused);
    await expectSharedDecksUnchanged();
  });
});

describe("decks lesson link", () => {
  it("decks lesson link: linking to a lesson of another class is refused for the teacher and for the admin client", async () => {
    const asTeacher = await world.teacher.client.from("decks").update({ lesson_id: foreignLesson.id }).eq("id", ready.id).select("id");
    expect(asTeacher.error?.code).toBe(checkFailed);
    const asAdmin = await admin.from("decks").update({ lesson_id: foreignLesson.id }).eq("id", ready.id);
    expect(asAdmin.error?.code).toBe(checkFailed);
    const inserted = await adminInsert({ lesson_id: foreignLesson.id });
    expect(inserted.error?.code).toBe(checkFailed);
    const missing = await world.teacher.client.from("decks").update({ lesson_id: randomUUID() }).eq("id", ready.id);
    expect(missing.error?.code).toBe(checkFailed);
    await expectSharedDecksUnchanged();
  });

  it("decks lesson link: a lesson with a linked deck cannot be deleted until the deck is unlinked", async () => {
    const lesson = await addLesson(shared.id, "Has slides");
    const deck = await addDeck(world.classroom.id, world.teacher.id, { lessonId: lesson.id });
    const remove = () => world.teacher.client.from("lessons").delete().eq("id", lesson.id).select("id");
    const blocked = await remove();
    expect(blocked.error?.code).toBe(foreignKeyFailed);
    expect(blocked.error?.message).toContain("decks_lesson_id_fkey");
    const asAdmin = await admin.from("lessons").delete().eq("id", lesson.id);
    expect(asAdmin.error?.code).toBe(foreignKeyFailed);
    const unlinked = await world.teacher.client.from("decks").update({ lesson_id: null }).eq("id", deck.id).select("id");
    expect(unlinked.data).toHaveLength(1);
    const removed = await remove();
    expect(removed.error).toBeNull();
    expect(removed.data).toEqual([{ id: lesson.id }]);
    expect(await readDeck(deck.id)).toEqual({ ...deck, lesson_id: null });
  });

  it("decks lesson link: a class with decks cannot be deleted", async () => {
    const asAdmin = await admin.from("classes").delete().eq("id", world.classroom.id);
    expect(asAdmin.error?.code).toBe(foreignKeyFailed);
    await expectSharedDecksUnchanged();
  });
});

describe("decks constraints", () => {
  it("decks constraints: a correct row is accepted", async () => {
    const row = fullRow(world.classroom.id, world.teacher.id);
    const { error } = await admin.from("decks").insert(row);
    expect(error).toBeNull();
    expect(await readDeck(row.id)).toMatchObject({ ...row, slide_count: null, ready_at: null, lesson_id: null });
  });

  it("decks constraints: a path that does not match the ids is refused", async () => {
    const elsewhere = deckPaths(world.otherClassroom.id, randomUUID(), "pptx");
    const row = fullRow(world.classroom.id, world.teacher.id);
    const changes: Record<string, unknown>[] = [
      { pdf_path: elsewhere.pdf_path },
      { pdf_path: `${world.classroom.id}/${randomUUID()}/slides.pdf` },
      { pdf_path: `${world.classroom.id}/${row.id}/other.pdf` },
      { pdf_path: `${world.classroom.id}/${row.id}/../${row.id}/slides.pdf` },
      { pdf_path: "slides.pdf" },
      { kind: "pptx", original_path: elsewhere.original_path },
      { kind: "pptx", original_path: `${world.classroom.id}/${row.id}/slides.pdf` },
    ];
    for (const change of changes) {
      const { error } = await admin.from("decks").insert({ ...row, ...change } as never);
      expect(error?.code).toBe(checkFailed);
    }
    expect(await readDeck(row.id)).toBeNull();
  });

  it("decks constraints: a pptx deck needs its original path and a pdf deck must not have one", async () => {
    const row = fullRow(world.classroom.id, world.teacher.id);
    const original = deckPaths(world.classroom.id, row.id, "pptx").original_path;
    const pptxWithout = await admin.from("decks").insert({ ...row, kind: "pptx" });
    expect(pptxWithout.error?.code).toBe(checkFailed);
    const pdfWith = await admin.from("decks").insert({ ...row, original_path: original });
    expect(pdfWith.error?.code).toBe(checkFailed);
    const pptxWith = await admin.from("decks").insert({ ...row, kind: "pptx", original_path: original });
    expect(pptxWith.error).toBeNull();
  });

  it("decks constraints: kind must be pdf or pptx", async () => {
    for (const kind of ["slides", "PDF", "", "html"]) {
      expect((await adminInsert({ kind })).error?.code).toBe(checkFailed);
    }
  });

  it("decks constraints: slide_count is between 1 and 300 and a ready deck needs one", async () => {
    for (const slide_count of [0, -1, 301]) {
      expect((await adminInsert({ slide_count })).error?.code).toBe(checkFailed);
    }
    const readyWithout = await adminInsert({ ready_at: new Date().toISOString() });
    expect(readyWithout.error?.code).toBe(checkFailed);
    const cleared = await admin.from("decks").update({ slide_count: null }).eq("id", ready.id);
    expect(cleared.error?.code).toBe(checkFailed);
    for (const slide_count of [1, 300]) {
      expect((await adminInsert({ slide_count, ready_at: new Date().toISOString() })).error).toBeNull();
    }
  });

  it("decks constraints: size_bytes is between 1 byte and 100 MB", async () => {
    for (const size_bytes of [0, -5, 104857601]) {
      expect((await adminInsert({ size_bytes })).error?.code).toBe(checkFailed);
    }
  });

  it("decks constraints: a title with hidden characters, padding, no text or 121 characters is refused", async () => {
    for (const title of ["Hidden​character", "Flip‮text", "Tab\there", " padded", "", "x".repeat(121)]) {
      expect((await adminInsert({ title })).error?.code).toBe(checkFailed);
    }
    expect((await adminInsert({ title: "x".repeat(120) })).error).toBeNull();
  });
});
