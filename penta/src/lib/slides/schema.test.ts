import { describe, expect, it } from "vitest";
import { slideLimits } from "@/lib/config";
import { contentBytes, deckContentSchema, imageFiles, isSavable, parseDeckContent, slideSpeech, type Block, type DeckContent } from "./schema";

const image = "0b6f3c1e-8a52-4f0e-9d3b-2f1c7a9e4d10.png";
const title: Block = { id: "title001", type: "title", x: 120, y: 120, w: 1360, h: 200, text: "Message queues", tone: "ink" };

function deck(blocks: unknown[] = [title], extra: Record<string, unknown> = {}): unknown {
  return { v: 1, slides: [{ id: "slide001", blocks }], ...extra };
}

function withBlock(change: Record<string, unknown>): unknown {
  return deck([{ ...title, ...change }]);
}

describe("deckContentSchema", () => {
  it("accepts one slide with every block type", () => {
    const blocks = [
      title,
      { id: "text0001", type: "text", x: 120, y: 360, w: 600, h: 300, text: "Line one\nLine two", tone: "maroon" },
      { id: "image001", type: "image", x: 800, y: 360, w: 400, h: 300, file: image, alt: "A broker" },
      { id: "box00001", type: "box", x: 120, y: 700, w: 300, h: 120, text: "Broker", fill: "gold" },
      { id: "arrow001", type: "arrow", x: 450, y: 720, w: 160, h: 80, direction: "right" },
    ];
    expect(parseDeckContent(deck(blocks))).toEqual(deck(blocks));
  });

  it.each([
    ["no slides", { v: 1, slides: [] }],
    ["an unknown version", { v: 2, slides: [{ id: "slide001", blocks: [] }] }],
    ["an unknown key on the deck", deck([title], { theme: "dark" })],
    ["an unknown key on a block", withBlock({ href: "https://example.com" })],
    ["an unknown block type", withBlock({ type: "video" })],
    ["a remote image", deck([{ id: "image001", type: "image", x: 0, y: 0, w: 100, h: 100, file: "https://example.com/a.png", alt: "" }])],
    ["a path in an image name", deck([{ id: "image001", type: "image", x: 0, y: 0, w: 100, h: 100, file: `../${image}`, alt: "" }])],
    ["an svg image", deck([{ id: "image001", type: "image", x: 0, y: 0, w: 100, h: 100, file: image.replace(".png", ".svg"), alt: "" }])],
    ["a fractional position", withBlock({ x: 10.5 })],
    ["a position that is not a number", withBlock({ x: "10" })],
    ["NaN", withBlock({ x: Number.NaN })],
    ["Infinity", withBlock({ w: Number.POSITIVE_INFINITY })],
    ["a negative position", withBlock({ y: -1 })],
    ["a block smaller than the minimum", withBlock({ w: slideLimits.blockMinSize - 1 })],
    ["a block past the right edge", withBlock({ x: 400, w: 1300 })],
    ["a block past the bottom edge", withBlock({ y: 800, h: 200 })],
    ["a title over the length limit", withBlock({ text: "x".repeat(slideLimits.titleLength + 1) })],
    ["a line break in a title", withBlock({ text: "One\nTwo" })],
    ["a NUL character", withBlock({ text: "One\u0000Two" })],
    ["a lone surrogate", withBlock({ text: "Half \ud83d" })],
    ["a zero-width character", withBlock({ text: "One\u200bTwo" })],
    ["a direction override", withBlock({ text: "One\u202eTwo" })],
    ["stacked combining marks", withBlock({ text: "Z\u0300\u0301\u0302\u0303" })],
    ["an unknown tone", withBlock({ tone: "gold" })],
    ["a raw color", deck([{ id: "box00001", type: "box", x: 0, y: 0, w: 100, h: 100, text: "", fill: "#ff0000" }])],
    ["a bad id", withBlock({ id: "Title-01" })],
    ["a Map in place of the deck", new Map()],
    ["a string", "{}"],
    ["null", null],
  ])("refuses %s", (_name, value) => {
    expect(parseDeckContent(value)).toBeNull();
  });

  it("keeps script text as plain text", () => {
    const text = "<script>alert(1)</script>";
    expect(parseDeckContent(withBlock({ text }))?.slides[0].blocks[0]).toMatchObject({ text });
  });

  it("refuses two gold boxes on one slide and allows one on each of two slides", () => {
    const gold = (id: string) => ({ id, type: "box", x: 0, y: 0, w: 100, h: 100, text: "", fill: "gold" });
    expect(parseDeckContent(deck([gold("box00001"), gold("box00002")]))).toBeNull();
    const two = { v: 1, slides: [{ id: "slide001", blocks: [gold("box00001")] }, { id: "slide002", blocks: [gold("box00002")] }] };
    expect(parseDeckContent(two)).not.toBeNull();
  });

  it("refuses the same id twice anywhere in the deck", () => {
    const two = { v: 1, slides: [{ id: "slide001", blocks: [title] }, { id: "slide002", blocks: [title] }] };
    expect(parseDeckContent(two)).toBeNull();
    expect(parseDeckContent({ v: 1, slides: [{ id: "title001", blocks: [title] }] })).toBeNull();
  });

  it("refuses more slides or blocks than the limits", () => {
    const slides = (count: number) => ({
      v: 1,
      slides: Array.from({ length: count }, (_, index) => ({ id: `s${String(index).padStart(7, "0")}`, blocks: [] })),
    });
    expect(parseDeckContent(slides(slideLimits.slidesMax))).not.toBeNull();
    expect(parseDeckContent(slides(slideLimits.slidesMax + 1))).toBeNull();
    const blocks = (count: number) =>
      deck(Array.from({ length: count }, (_, index) => ({ ...title, id: `b${String(index).padStart(7, "0")}` })));
    expect(parseDeckContent(blocks(slideLimits.blocksPerSlide))).not.toBeNull();
    expect(parseDeckContent(blocks(slideLimits.blocksPerSlide + 1))).toBeNull();
  });
});

describe("isSavable", () => {
  it("refuses content over the byte limit even when every field is within its own limit", () => {
    const heavy: DeckContent = {
      v: 1,
      slides: Array.from({ length: 10 }, (_, slide) => ({
        id: `s${String(slide).padStart(7, "0")}`,
        blocks: Array.from({ length: 30 }, (_, block) => ({
          id: `b${String(slide * 30 + block).padStart(7, "0")}`,
          type: "text" as const,
          x: 0,
          y: 0,
          w: 100,
          h: 100,
          text: "字".repeat(slideLimits.textLength),
          tone: "ink" as const,
        })),
      })),
    };
    expect(deckContentSchema.safeParse(heavy).success).toBe(true);
    expect(contentBytes(heavy)).toBeGreaterThan(slideLimits.contentMaxBytes);
    expect(isSavable(heavy)).toBe(false);
    expect(isSavable(deck())).toBe(true);
    expect(isSavable({ v: 1 })).toBe(false);
  });
});

describe("reading a slide", () => {
  it("joins the text and image descriptions for a screen reader", () => {
    const parsed = parseDeckContent(
      deck([title, { id: "image001", type: "image", x: 0, y: 400, w: 100, h: 100, file: image, alt: "A broker" }, { id: "arrow001", type: "arrow", x: 0, y: 600, w: 100, h: 50, direction: "up" }]),
    )!;
    expect(slideSpeech(parsed.slides[0])).toBe("Message queues. A broker");
  });

  it("lists each image file once", () => {
    const block = (id: string) => ({ id, type: "image", x: 0, y: 0, w: 100, h: 100, file: image, alt: "" });
    expect(imageFiles(parseDeckContent(deck([block("image001"), block("image002")]))!)).toEqual([image]);
  });
});
