import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  loadDeck: vi.fn(),
  isClassOwner: vi.fn(),
  room: vi.fn(),
  store: vi.fn(),
  read: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({}) }));
vi.mock("@/lib/decks", () => ({ loadDeck: mocks.loadDeck }));
vi.mock("@/lib/classes", () => ({ isClassOwner: mocks.isClassOwner }));
vi.mock("@/lib/slide-images", () => ({ slideImageRoom: mocks.room, storeSlideImage: mocks.store, readSlideImage: mocks.read }));

import { GET } from "./[name]/route";
import { POST } from "./route";

const deckId = "7b0f6a52-1c1d-4f6e-9d55-0d6d3a1f2c11";
const fileName = "0b6f3c1e-8a52-4f0e-9d3b-2f1c7a9e4d10.png";
const teacher = { id: "teacher-1", fullName: "Maria Santos", role: "teacher" };
const student = { id: "student-1", fullName: "Ana Cruz", role: "student" };
const deck = { id: deckId, classId: "class-1", kind: "native", ready: true };
const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 2, 128, 0, 0, 1, 224, 8, 6, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 73, 68, 65, 84, 0, 0, 0, 0]);

function read(name: string, id = deckId) {
  return GET(new Request(`http://localhost/decks/${id}/images/x`), { params: Promise.resolve({ id, name }) });
}

function upload(file: File | null, headers: Record<string, string> = {}, id = deckId) {
  const body = new FormData();
  if (file) body.set("file", file);
  const request = { url: `http://localhost/decks/${id}/images`, headers: new Headers(headers), formData: async () => body };
  return POST(request as unknown as Request, { params: Promise.resolve({ id }) });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getCurrentUser.mockResolvedValue(teacher);
  mocks.loadDeck.mockResolvedValue(deck);
  mocks.isClassOwner.mockResolvedValue(true);
  mocks.room.mockResolvedValue("ok");
  mocks.store.mockResolvedValue(fileName);
  mocks.read.mockResolvedValue(new Blob([png]));
});

describe("GET a slide image", () => {
  it("serves the image of a deck the caller can read, with safe headers", async () => {
    mocks.getCurrentUser.mockResolvedValue(student);
    const response = await read(fileName);
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("image/png");
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(response.headers.get("Content-Security-Policy")).toBe("default-src 'none'; sandbox");
    expect(response.headers.get("Cache-Control")).toBe("private, max-age=300");
    expect(mocks.read).toHaveBeenCalledWith(deck, fileName);
  });

  it.each([
    "../slides.pdf",
    `../../other-class/${deckId}/slides.pdf`,
    `..%2F${fileName}`,
    "slides.pdf",
    fileName.replace(".png", ".svg"),
    fileName.toUpperCase(),
    `${fileName}/extra`,
    "",
  ])("answers 404 for the name %j before reading anything", async (name) => {
    const response = await read(name);
    expect(response.status).toBe(404);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(mocks.loadDeck).not.toHaveBeenCalled();
    expect(mocks.read).not.toHaveBeenCalled();
  });

  it("answers 404 when signed out, for a deck the caller cannot read, an uploaded deck and a missing file", async () => {
    mocks.getCurrentUser.mockResolvedValue(null);
    expect((await read(fileName)).status).toBe(404);
    mocks.getCurrentUser.mockResolvedValue(student);
    mocks.loadDeck.mockResolvedValue(null);
    expect((await read(fileName)).status).toBe(404);
    mocks.loadDeck.mockResolvedValue({ ...deck, kind: "pdf" });
    expect((await read(fileName)).status).toBe(404);
    expect(mocks.read).not.toHaveBeenCalled();
    mocks.loadDeck.mockResolvedValue(deck);
    mocks.read.mockResolvedValue(null);
    expect((await read(fileName)).status).toBe(404);
    expect((await read(fileName, "not-a-deck")).status).toBe(404);
  });
});

describe("POST a slide image", () => {
  it("stores a valid image for the class teacher and returns its name", async () => {
    const response = await upload(new File([png], "broker.png", { type: "image/png" }));
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ file: fileName });
    expect(mocks.room).toHaveBeenCalledWith("teacher-1", deckId, png.length);
    expect(mocks.store).toHaveBeenCalledWith(deck, "png", expect.any(Uint8Array));
  });

  it("refuses a student, another teacher, an uploaded deck and another origin", async () => {
    const file = new File([png], "broker.png", { type: "image/png" });
    mocks.getCurrentUser.mockResolvedValue(student);
    expect((await upload(file)).status).toBe(404);
    mocks.getCurrentUser.mockResolvedValue(teacher);
    mocks.isClassOwner.mockResolvedValue(false);
    expect((await upload(file)).status).toBe(404);
    mocks.isClassOwner.mockResolvedValue(true);
    mocks.loadDeck.mockResolvedValue({ ...deck, kind: "pptx" });
    expect((await upload(file)).status).toBe(404);
    mocks.loadDeck.mockResolvedValue(deck);
    expect((await upload(file, { origin: "https://evil.example" })).status).toBe(404);
    expect(mocks.store).not.toHaveBeenCalled();
  });

  it("refuses files that are not a still png, jpg or webp", async () => {
    const cases = [
      null,
      new File(["<svg xmlns='http://www.w3.org/2000/svg'><script>alert(1)</script></svg>"], "a.svg", { type: "image/svg+xml" }),
      new File(["<html></html>"], "a.png", { type: "image/png" }),
      new File([png], "a.jpg", { type: "image/jpeg" }),
      new File([png], "a.png", { type: "text/html" }),
    ];
    for (const file of cases) {
      const response = await upload(file);
      expect(response.status).toBe(400);
      expect((await response.json()).message).toEqual(expect.any(String));
    }
    expect(mocks.store).not.toHaveBeenCalled();
  });

  it("refuses when the deck has no room and when storage fails", async () => {
    const file = new File([png], "broker.png", { type: "image/png" });
    mocks.room.mockResolvedValue("image_limit");
    expect((await upload(file)).status).toBe(409);
    mocks.room.mockResolvedValue("full");
    expect((await upload(file)).status).toBe(409);
    expect(mocks.store).not.toHaveBeenCalled();
    mocks.room.mockResolvedValue("ok");
    mocks.store.mockResolvedValue(null);
    expect((await upload(file)).status).toBe(503);
  });
});
