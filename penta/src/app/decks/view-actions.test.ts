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

import { refreshDeckSource } from "./view-actions";

const deckId = "7b0f6a52-1c1d-4f6e-9d55-0d6d3a1f2c11";
const student = { id: "student-1", fullName: "Ana Cruz", role: "student" };
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
