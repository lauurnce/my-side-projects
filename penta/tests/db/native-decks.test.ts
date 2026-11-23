import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { liveLimits } from "../../src/lib/config";
import {
  addDeck,
  addLesson,
  addModule,
  admin,
  anon,
  createNativeDeck,
  createRouteWorld,
  createdNativeDeck,
  liveState,
  publishNativeDeck,
  readDeck,
  readDeckContent,
  readViews,
  recordView,
  removeCreatedUsers,
  saveDeckContent,
  setSessionActive,
  slideContent,
  startedSession,
  storeDeckFile,
} from "./helpers";

const tinyPng = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82]);
const hoursAgo = (hours: number) => new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();

let world: Awaited<ReturnType<typeof createRouteWorld>>;

async function draftDeck(content = slideContent()): Promise<string> {
  return createdNativeDeck(world.teacher.id, world.classroom.id, { content });
}

async function sharedDeck(content = slideContent()): Promise<string> {
  const deckId = await draftDeck(content);
  expect((await publishNativeDeck(world.teacher.id, deckId)).result).toBe("published");
  return deckId;
}

async function storedImage(deckId: string): Promise<string> {
  const file = `${randomUUID()}.png`;
  await storeDeckFile(`${world.classroom.id}/${deckId}/images/${file}`, tinyPng, "image/png");
  return file;
}

beforeAll(async () => {
  world = await createRouteWorld();
});

afterAll(removeCreatedUsers);

describe("who can call the editor functions", () => {
  it("no API role can call them", async () => {
    const deckId = await draftDeck();
    for (const client of [anon, world.studentA.client, world.teacher.client]) {
      const calls = [
        client.rpc("create_native_deck", { editor: world.teacher.id, target_class: world.classroom.id, deck_title: "Mine", target_lesson: null as never, content: slideContent() }),
        client.rpc("save_deck_content", { editor: world.teacher.id, target_deck: deckId, known_version: 1, save_id: randomUUID(), content: slideContent(2) }),
        client.rpc("publish_native_deck", { editor: world.teacher.id, target_deck: deckId }),
        client.rpc("deck_image_room", { editor: world.teacher.id, target_deck: deckId, image_bytes: 10 }),
        client.rpc("unused_deck_images", { target_deck: deckId }),
      ];
      for (const call of calls) {
        const { data, error } = await call;
        expect(error).not.toBeNull();
        expect(data).toBeNull();
      }
    }
    expect((await readDeckContent(deckId))!.version).toBe(1);
    expect((await readDeck(deckId))!.ready_at).toBeNull();
  });
});

describe("create_native_deck", () => {
  it("makes a hidden deck with its content", async () => {
    const { result, error } = await createNativeDeck(world.teacher.id, world.classroom.id, { content: slideContent(3) });
    expect(error).toBeNull();
    expect(result).toEqual({ status: "created", deck_id: expect.any(String) });
    expect(await readDeck(result!.deck_id!)).toMatchObject({ kind: "native", slide_count: 3, ready_at: null, class_id: world.classroom.id });
    const { data } = await admin.from("decks").select("pdf_path, original_path, size_bytes").eq("id", result!.deck_id!).single();
    expect(data).toMatchObject({ pdf_path: null, original_path: null });
    expect(data!.size_bytes).toBeGreaterThan(0);
    expect(await readDeckContent(result!.deck_id!)).toMatchObject({ version: 1, updated_by: world.teacher.id, content: slideContent(3) });
  });

  it("refuses another teacher, a student and nobody", async () => {
    for (const editor of [world.otherTeacher.id, world.studentA.id, null]) {
      expect((await createNativeDeck(editor, world.classroom.id)).result).toEqual({ status: "refused" });
    }
  });

  it("refuses content that is not a deck, has no slides, too many slides, or names an image", async () => {
    const cases = [[], "text", {}, { v: 1, slides: [] }, { v: 1, slides: "none" }, slideContent(61), slideContent(1, [`${randomUUID()}.png`])];
    for (const content of cases) {
      expect((await createNativeDeck(world.teacher.id, world.classroom.id, { content: content as never })).result).toEqual({ status: "bad_content" });
    }
  });

  it("refuses a lesson of another class", async () => {
    const elsewhere = await addLesson((await addModule(world.otherClassroom.id)).id);
    expect((await createNativeDeck(world.teacher.id, world.classroom.id, { lessonId: elsewhere.id })).result).toEqual({ status: "bad_lesson" });
  });

  it("a hidden deck is not an unfinished upload: it is not swept and does not block uploads", async () => {
    const room = await createRouteWorld();
    const ids = [];
    for (let turn = 0; turn < 4; turn += 1) ids.push(await createdNativeDeck(room.teacher.id, room.classroom.id));
    await admin.from("decks").update({ created_at: hoursAgo(7) }).in("id", ids);
    const reserved = await room.teacher.client.rpc("reserve_deck", {
      target_class: room.classroom.id,
      deck_title: "Uploaded",
      deck_kind: "pdf",
      target_lesson: null as never,
      declared_bytes: 1024,
    });
    expect((reserved.data as { status: string }).status).toBe("reserved");
    expect((await admin.rpc("sweep_decks")).error).toBeNull();
    for (const id of ids) expect(await readDeck(id)).not.toBeNull();
  });
});

describe("deck_contents", () => {
  it("students read the content only after the deck is published", async () => {
    const deckId = await draftDeck();
    const read = (client: typeof anon) => client.from("deck_contents").select("deck_id, version").eq("deck_id", deckId);
    expect((await read(world.teacher.client)).data).toHaveLength(1);
    expect((await read(world.studentA.client)).data).toEqual([]);
    expect((await world.studentA.client.from("decks").select("id").eq("id", deckId)).data).toEqual([]);

    await publishNativeDeck(world.teacher.id, deckId);
    expect((await read(world.studentA.client)).data).toHaveLength(1);
    for (const client of [world.otherStudent.client, world.outsider.client, world.otherTeacher.client]) {
      expect((await read(client)).data).toEqual([]);
    }
    expect((await read(anon)).data ?? []).toEqual([]);
  });

  it("a published deck on a draft lesson stays hidden from students", async () => {
    const lesson = await addLesson((await addModule(world.classroom.id)).id);
    const deckId = await createdNativeDeck(world.teacher.id, world.classroom.id, { lessonId: lesson.id });
    await publishNativeDeck(world.teacher.id, deckId);
    expect((await world.studentA.client.from("deck_contents").select("deck_id").eq("deck_id", deckId)).data).toEqual([]);
  });

  it("nobody writes the table through the API", async () => {
    const deckId = await sharedDeck();
    for (const client of [world.teacher.client, world.studentA.client]) {
      const changed = await client.from("deck_contents").update({ content: slideContent(9) } as never).eq("deck_id", deckId).select("deck_id");
      const removed = await client.from("deck_contents").delete().eq("deck_id", deckId).select("deck_id");
      const added = await client.from("deck_contents").insert({ deck_id: randomUUID(), content: slideContent() } as never);
      expect(changed.error).not.toBeNull();
      expect(removed.error).not.toBeNull();
      expect(added.error).not.toBeNull();
    }
    expect(await readDeckContent(deckId)).toMatchObject({ version: 1, content: slideContent() });
  });
});

describe("save_deck_content", () => {
  it("saves, raises the version and follows the slide count", async () => {
    const deckId = await draftDeck();
    const { result, error } = await saveDeckContent(world.teacher.id, deckId, 1, slideContent(4));
    expect(error).toBeNull();
    expect(result).toEqual({ status: "saved", version: 2 });
    expect(await readDeckContent(deckId)).toMatchObject({ version: 2, content: slideContent(4) });
    expect((await readDeck(deckId))!.slide_count).toBe(4);
  });

  it("answers conflict for a stale version and keeps the stored content", async () => {
    const deckId = await draftDeck();
    await saveDeckContent(world.teacher.id, deckId, 1, slideContent(2));
    expect((await saveDeckContent(world.teacher.id, deckId, 1, slideContent(5))).result).toEqual({ status: "conflict", version: 2 });
    expect(await readDeckContent(deckId)).toMatchObject({ version: 2, content: slideContent(2) });
  });

  it("answers saved when the same save is sent again after its answer was lost", async () => {
    const deckId = await draftDeck();
    const saveId = randomUUID();
    expect((await saveDeckContent(world.teacher.id, deckId, 1, slideContent(2), saveId)).result).toEqual({ status: "saved", version: 2 });
    expect((await saveDeckContent(world.teacher.id, deckId, 1, slideContent(2), saveId)).result).toEqual({ status: "saved", version: 2 });
    expect((await readDeckContent(deckId))!.version).toBe(2);
  });

  it("answers not_found for another teacher, a student, an uploaded deck and missing arguments", async () => {
    const deckId = await draftDeck();
    const uploaded = await addDeck(world.classroom.id, world.teacher.id);
    expect((await saveDeckContent(world.otherTeacher.id, deckId, 1, slideContent(2))).result).toEqual({ status: "not_found" });
    expect((await saveDeckContent(world.studentA.id, deckId, 1, slideContent(2))).result).toEqual({ status: "not_found" });
    expect((await saveDeckContent(world.teacher.id, uploaded.id, 1, slideContent(2))).result).toEqual({ status: "not_found" });
    expect((await saveDeckContent(world.teacher.id, randomUUID(), 1, slideContent(2))).result).toEqual({ status: "not_found" });
    expect((await saveDeckContent(world.teacher.id, deckId, null, slideContent(2))).result).toEqual({ status: "not_found" });
    expect((await saveDeckContent(world.teacher.id, deckId, 1, slideContent(2), null)).result).toEqual({ status: "not_found" });
    expect((await readDeckContent(deckId))!.version).toBe(1);
  });

  it("refuses content over 1 MB and content that is not a deck", async () => {
    const deckId = await draftDeck();
    const heavy = { ...slideContent(), padding: "x".repeat(1024 * 1024) };
    expect((await saveDeckContent(world.teacher.id, deckId, 1, heavy)).result).toEqual({ status: "too_large" });
    for (const content of [{}, { v: 1, slides: [] }, slideContent(61)]) {
      expect((await saveDeckContent(world.teacher.id, deckId, 1, content)).result).toEqual({ status: "bad_content" });
    }
    expect((await readDeckContent(deckId))!.version).toBe(1);
  });

  it("is refused while the deck is live and allowed again when the session is stale", async () => {
    const deckId = await sharedDeck(slideContent(3));
    const sessionId = await startedSession(world.teacher.client, deckId);
    expect((await saveDeckContent(world.teacher.id, deckId, 1, slideContent(2))).result).toEqual({ status: "live", session_id: sessionId });
    expect((await readDeckContent(deckId))!.version).toBe(1);

    await setSessionActive(sessionId, liveLimits.leaseMinutes + 1);
    expect((await saveDeckContent(world.teacher.id, deckId, 1, slideContent(2))).result).toEqual({ status: "saved", version: 2 });
  });

  it("refuses an image that is not stored for this deck and accepts one that is", async () => {
    const deckId = await draftDeck();
    const other = await draftDeck();
    const elsewhere = await storedImage(other);
    for (const file of [`${randomUUID()}.png`, elsewhere, "../slides.pdf"]) {
      expect((await saveDeckContent(world.teacher.id, deckId, 1, slideContent(1, [file]))).result).toEqual({ status: "missing_image" });
    }
    const before = (await admin.from("decks").select("size_bytes").eq("id", deckId).single()).data!.size_bytes;
    const file = await storedImage(deckId);
    expect((await saveDeckContent(world.teacher.id, deckId, 1, slideContent(1, [file]))).result).toEqual({ status: "saved", version: 2 });
    const after = (await admin.from("decks").select("size_bytes").eq("id", deckId).single()).data!.size_bytes;
    expect(after).toBeGreaterThanOrEqual(before + tinyPng.length);
  });

  it("drops views of slides that no longer exist", async () => {
    const deckId = await sharedDeck(slideContent(4));
    for (const slide of [1, 2, 3, 4]) await recordView(deckId, world.studentA.id, slide);
    expect((await saveDeckContent(world.teacher.id, deckId, 1, slideContent(2))).result?.status).toBe("saved");
    expect((await readViews(deckId)).map((row) => row.slide_no).sort()).toEqual([1, 2]);
  });
});

describe("publish_native_deck", () => {
  it("publishes once, for the class teacher only", async () => {
    const deckId = await draftDeck();
    const uploaded = await addDeck(world.classroom.id, world.teacher.id, { ready: false });
    expect((await publishNativeDeck(world.otherTeacher.id, deckId)).result).toBe("not_found");
    expect((await publishNativeDeck(world.studentA.id, deckId)).result).toBe("not_found");
    expect((await publishNativeDeck(world.teacher.id, uploaded.id)).result).toBe("not_found");
    expect((await readDeck(deckId))!.ready_at).toBeNull();
    expect((await publishNativeDeck(world.teacher.id, deckId)).result).toBe("published");
    expect((await readDeck(deckId))!.ready_at).not.toBeNull();
    expect((await publishNativeDeck(world.teacher.id, deckId)).result).toBe("not_found");
  });
});

describe("images and the sweep", () => {
  it("keeps the images of a deck that exists and returns them once the deck is gone", async () => {
    const deckId = await draftDeck();
    const file = await storedImage(deckId);
    const name = `${world.classroom.id}/${deckId}/images/${file}`;
    expect((await admin.rpc("sweep_decks")).data).not.toContain(name);
    expect((await admin.rpc("unused_deck_images", { target_deck: deckId })).data).toEqual([]);

    await admin.from("decks").delete().eq("id", deckId);
    expect((await admin.rpc("sweep_decks")).data).toContain(name);
    await admin.storage.from("decks").remove([name]);
  });

  it("deck_image_room answers ok for the owner and not_found for others", async () => {
    const deckId = await draftDeck();
    const uploaded = await addDeck(world.classroom.id, world.teacher.id);
    const room = (editor: string, target: string, bytes: number) =>
      admin.rpc("deck_image_room", { editor, target_deck: target, image_bytes: bytes }).then((reply) => reply.data);
    expect(await room(world.teacher.id, deckId, 2048)).toBe("ok");
    expect(await room(world.otherTeacher.id, deckId, 2048)).toBe("not_found");
    expect(await room(world.teacher.id, uploaded.id, 2048)).toBe("not_found");
    expect(await room(world.teacher.id, deckId, 0)).toBe("not_found");
    expect(await room(world.teacher.id, deckId, 5 * 1024 * 1024 * 1024)).toBe("full");
  });
});

describe("live_state", () => {
  it("carries the content version of an editor deck and null for an uploaded one", async () => {
    const deckId = await sharedDeck();
    const uploaded = await addDeck(world.classroom.id, world.teacher.id);
    expect((await liveState(world.studentA.client, deckId)).state).toMatchObject({ running: false, content_version: 1 });
    await saveDeckContent(world.teacher.id, deckId, 1, slideContent(2));
    await startedSession(world.teacher.client, deckId);
    expect((await liveState(world.studentA.client, deckId)).state).toMatchObject({ running: true, content_version: 2 });
    expect((await liveState(world.studentA.client, uploaded.id)).state).toMatchObject({ content_version: null });
    expect((await liveState(world.outsider.client, deckId)).state).toMatchObject({ session_id: null, content_version: null });
  });
});
