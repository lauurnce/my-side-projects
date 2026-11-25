import { beforeEach, describe, expect, it, vi } from "vitest";
import { slideLimits } from "@/lib/config";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  requireRole: vi.fn(),
  rpc: vi.fn(),
  maybeSingle: vi.fn(),
  prune: vi.fn(),
  revalidatePath: vi.fn(),
  redirect: vi.fn((path: string) => {
    throw new Error(`redirect:${path}`);
  }),
}));

vi.mock("@/lib/auth", () => ({ getCurrentUser: mocks.getCurrentUser, requireRole: mocks.requireRole }));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    rpc: mocks.rpc,
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: mocks.maybeSingle }) }) }),
  }),
}));
vi.mock("@/lib/slide-images", () => ({ pruneSlideImages: mocks.prune }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));

import { createNativeDeck, publishDeck, saveDeck } from "./editor-actions";
import { editorMessages } from "./editor-schema";

const deckId = "7b0f6a52-1c1d-4f6e-9d55-0d6d3a1f2c11";
const classId = "0d6d3a1f-1c1d-4f6e-9d55-7b0f6a522c11";
const saveId = "2f1c7a9e-8a52-4f0e-9d3b-0b6f3c1e4d10";
const teacher = { id: "teacher-1", fullName: "Maria Santos", role: "teacher" };
const content = { v: 1, slides: [{ id: "slide001", blocks: [{ id: "title001", type: "title", x: 0, y: 0, w: 400, h: 100, text: "One", tone: "ink" }] }] };
const input = { deckId, knownVersion: 3, saveId, content };

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [name, value] of Object.entries(fields)) data.set(name, value);
  return data;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getCurrentUser.mockResolvedValue(teacher);
  mocks.requireRole.mockResolvedValue(teacher);
  mocks.rpc.mockResolvedValue({ data: { status: "saved", version: 4 }, error: null });
  mocks.maybeSingle.mockResolvedValue({ data: { class_id: classId } });
  mocks.prune.mockResolvedValue(undefined);
});

describe("saveDeck", () => {
  it("saves as the signed-in teacher, whatever editor the caller names", async () => {
    expect(await saveDeck({ ...input, editor: "someone-else" })).toEqual({ status: "saved", version: 4 });
    expect(mocks.rpc).toHaveBeenCalledWith("save_deck_content", {
      editor: "teacher-1",
      target_deck: deckId,
      known_version: 3,
      save_id: saveId,
      content,
    });
    expect(mocks.prune).toHaveBeenCalledWith(deckId);
  });

  it("answers signed_out without redirecting when the session is gone", async () => {
    mocks.getCurrentUser.mockResolvedValue(null);
    expect(await saveDeck(input)).toEqual({ status: "signed_out" });
    expect(mocks.redirect).not.toHaveBeenCalled();
    expect(mocks.requireRole).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("refuses a student and malformed input without touching the database", async () => {
    mocks.getCurrentUser.mockResolvedValue({ ...teacher, role: "student" });
    expect(await saveDeck(input)).toEqual({ status: "refused" });
    mocks.getCurrentUser.mockResolvedValue(teacher);
    for (const bad of [null, {}, { ...input, deckId: "deck" }, { ...input, knownVersion: "3" }]) {
      expect(await saveDeck(bad)).toEqual({ status: "refused" });
    }
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("refuses content that fails the schema", async () => {
    const cases = [
      { v: 1, slides: [] },
      { v: 1, slides: [{ id: "slide001", blocks: [{ ...content.slides[0].blocks[0], href: "https://example.com" }] }] },
      { v: 1, slides: [{ id: "slide001", blocks: [{ id: "image001", type: "image", x: 0, y: 0, w: 100, h: 100, file: "https://example.com/a.png", alt: "" }] }] },
      { ...content, extra: true },
    ];
    for (const bad of cases) expect(await saveDeck({ ...input, content: bad })).toEqual({ status: "refused" });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("refuses content over the size limit", async () => {
    const heavy = {
      v: 1,
      slides: Array.from({ length: 10 }, (_, slide) => ({
        id: `s${String(slide).padStart(7, "0")}`,
        blocks: Array.from({ length: 30 }, (_, block) => ({
          id: `b${String(slide * 30 + block).padStart(7, "0")}`,
          type: "text",
          x: 0,
          y: 0,
          w: 100,
          h: 100,
          text: "字".repeat(slideLimits.textLength),
          tone: "ink",
        })),
      })),
    };
    expect(await saveDeck({ ...input, content: heavy })).toEqual({ status: "too_large" });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("passes on conflict and live answers and does not prune", async () => {
    mocks.rpc.mockResolvedValue({ data: { status: "conflict", version: 9 }, error: null });
    expect(await saveDeck(input)).toEqual({ status: "conflict", version: 9 });
    mocks.rpc.mockResolvedValue({ data: { status: "live", session_id: "s-1" }, error: null });
    expect(await saveDeck(input)).toEqual({ status: "live", sessionId: "s-1" });
    mocks.rpc.mockResolvedValue({ data: null, error: { message: "down" } });
    expect(await saveDeck(input)).toEqual({ status: "failed" });
    expect(mocks.prune).not.toHaveBeenCalled();
  });

  it("still answers saved when pruning fails", async () => {
    mocks.prune.mockRejectedValue(new Error("storage down"));
    expect(await saveDeck(input)).toEqual({ status: "saved", version: 4 });
  });
});

describe("createNativeDeck", () => {
  it("creates the deck as the teacher with one valid slide and opens the editor", async () => {
    mocks.rpc.mockResolvedValue({ data: { status: "created", deck_id: deckId }, error: null });
    await expect(createNativeDeck({}, form({ classId, title: "Week 3", lessonId: "" }))).rejects.toThrow(`redirect:/decks/${deckId}/edit`);
    const [name, args] = mocks.rpc.mock.calls[0];
    expect(name).toBe("create_native_deck");
    expect(args).toMatchObject({ editor: "teacher-1", target_class: classId, deck_title: "Week 3", target_lesson: null });
    expect(args.content.slides).toHaveLength(1);
    expect(mocks.revalidatePath).toHaveBeenCalledWith(`/classes/${classId}`);
  });

  it("shows the reason when the title is blank or the database refuses", async () => {
    expect((await createNativeDeck({}, form({ classId, title: " ", lessonId: "" }))).tone).toBe("alert");
    expect(mocks.rpc).not.toHaveBeenCalled();
    mocks.rpc.mockResolvedValue({ data: { status: "deck_limit" }, error: null });
    expect(await createNativeDeck({}, form({ classId, title: "Week 3", lessonId: "" }))).toEqual({ tone: "alert", message: editorMessages.deckLimit });
  });
});

describe("publishDeck", () => {
  it("publishes as the teacher and refreshes the class page", async () => {
    mocks.rpc.mockResolvedValue({ data: "published", error: null });
    expect(await publishDeck({ deckId })).toEqual({ tone: "status", message: editorMessages.published });
    expect(mocks.rpc).toHaveBeenCalledWith("publish_native_deck", { editor: "teacher-1", target_deck: deckId });
    expect(mocks.revalidatePath).toHaveBeenCalledWith(`/classes/${classId}`);
  });

  it("refuses when signed out, for a student, and when the database says no", async () => {
    mocks.getCurrentUser.mockResolvedValue(null);
    expect((await publishDeck({ deckId })).tone).toBe("alert");
    mocks.getCurrentUser.mockResolvedValue({ ...teacher, role: "student" });
    expect((await publishDeck({ deckId })).tone).toBe("alert");
    expect(mocks.rpc).not.toHaveBeenCalled();
    mocks.getCurrentUser.mockResolvedValue(teacher);
    mocks.rpc.mockResolvedValue({ data: "not_found", error: null });
    expect(await publishDeck({ deckId })).toEqual({ tone: "alert", message: editorMessages.gone });
  });
});
