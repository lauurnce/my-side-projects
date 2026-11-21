import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  upsert: vi.fn(),
  from: vi.fn(),
  loadDeck: vi.fn(),
  signDeckView: vi.fn(),
  deckFileSize: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ requireUser: mocks.requireUser }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ from: mocks.from }) }));
vi.mock("@/lib/decks", () => ({ loadDeck: mocks.loadDeck }));
vi.mock("@/lib/deck-storage", () => ({ signDeckView: mocks.signDeckView, deckFileSize: mocks.deckFileSize }));

import { recordSlideView, refreshDeckSource } from "./view-actions";

const deckId = "7b0f6a52-1c1d-4f6e-9d55-0d6d3a1f2c11";
const student = { id: "student-1", fullName: "Ana Cruz", role: "student" };
const teacher = { id: "teacher-1", fullName: "Ben Reyes", role: "teacher" };
const readyDeck = { id: deckId, ready: true, pdfPath: "class/deck/slides.pdf" };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireUser.mockResolvedValue(student);
  mocks.upsert.mockResolvedValue({ error: null });
  mocks.from.mockReturnValue({ upsert: mocks.upsert });
  mocks.loadDeck.mockResolvedValue(readyDeck);
  mocks.signDeckView.mockResolvedValue("https://storage.test/signed");
  mocks.deckFileSize.mockResolvedValue(4096);
});

describe("recordSlideView", () => {
  it("records a slide for the signed in student", async () => {
    expect(await recordSlideView({ deckId, slideNo: 3 })).toEqual({ ok: true });
    expect(mocks.from).toHaveBeenCalledWith("deck_views");
    expect(mocks.upsert).toHaveBeenCalledWith(
      { deck_id: deckId, student_id: "student-1", slide_no: 3 },
      { onConflict: "deck_id,student_id,slide_no", ignoreDuplicates: true },
    );
  });

  it("checks the session before anything else", async () => {
    mocks.requireUser.mockRejectedValue(new Error("redirect"));
    await expect(recordSlideView({ deckId, slideNo: 3 })).rejects.toThrow("redirect");
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it("records nothing for a teacher", async () => {
    mocks.requireUser.mockResolvedValue(teacher);
    expect(await recordSlideView({ deckId, slideNo: 3 })).toEqual({ ok: false });
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it.each([
    { deckId: "not-a-uuid", slideNo: 1 },
    { deckId, slideNo: 0 },
    { deckId, slideNo: 301 },
    { deckId, slideNo: 1.5 },
    { deckId, slideNo: "2" as unknown as number },
  ])("refuses bad input %o", async (input) => {
    expect(await recordSlideView(input)).toEqual({ ok: false });
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it("turns a refused write into ok false", async () => {
    mocks.upsert.mockResolvedValue({ error: { code: "42501", message: "row-level security" } });
    expect(await recordSlideView({ deckId, slideNo: 3 })).toEqual({ ok: false });
  });
});

describe("refreshDeckSource", () => {
  it("signs the stored file of a deck the caller can read", async () => {
    expect(await refreshDeckSource({ deckId })).toEqual({ url: "https://storage.test/signed", length: 4096 });
    expect(mocks.signDeckView).toHaveBeenCalledWith("class/deck/slides.pdf");
    expect(mocks.deckFileSize).toHaveBeenCalledWith("class/deck/slides.pdf");
  });

  it("ignores any path the caller sends", async () => {
    const input = { deckId, pdfPath: "other/deck/slides.pdf" } as { deckId: string };
    await refreshDeckSource(input);
    expect(mocks.signDeckView).toHaveBeenCalledWith("class/deck/slides.pdf");
  });

  it("returns null for a bad id", async () => {
    expect(await refreshDeckSource({ deckId: "nope" })).toBeNull();
    expect(mocks.loadDeck).not.toHaveBeenCalled();
  });

  it("returns null when the deck is hidden or missing", async () => {
    mocks.loadDeck.mockResolvedValue(null);
    expect(await refreshDeckSource({ deckId })).toBeNull();
    expect(mocks.signDeckView).not.toHaveBeenCalled();
  });

  it("returns null when the deck is not ready", async () => {
    mocks.loadDeck.mockResolvedValue({ ...readyDeck, ready: false });
    expect(await refreshDeckSource({ deckId })).toBeNull();
    expect(mocks.signDeckView).not.toHaveBeenCalled();
  });

  it("returns null when the file cannot be signed or sized", async () => {
    mocks.signDeckView.mockResolvedValue(null);
    expect(await refreshDeckSource({ deckId })).toBeNull();
    mocks.signDeckView.mockResolvedValue("https://storage.test/signed");
    mocks.deckFileSize.mockResolvedValue(null);
    expect(await refreshDeckSource({ deckId })).toBeNull();
  });
});
