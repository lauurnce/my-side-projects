import { describe, expect, it } from "vitest";
import { copySlide, newId } from "./ids";
import { parseDeckContent, type Slide } from "./schema";

describe("newId", () => {
  it("makes eight lowercase letters or digits, different each time", () => {
    const ids = Array.from({ length: 200 }, newId);
    for (const id of ids) expect(id).toMatch(/^[a-z0-9]{8}$/);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("copySlide", () => {
  it("copies every block under new ids and leaves the original alone", () => {
    const slide: Slide = {
      id: "slide001",
      blocks: [
        { id: "title001", type: "title", x: 0, y: 0, w: 100, h: 100, text: "One", tone: "ink" },
        { id: "arrow001", type: "arrow", x: 0, y: 200, w: 100, h: 50, direction: "down" },
      ],
    };
    let next = 0;
    const copy = copySlide(slide, () => `copy${String((next += 1)).padStart(4, "0")}`);
    expect(copy).toEqual({
      id: "copy0001",
      blocks: [
        { ...slide.blocks[0], id: "copy0002" },
        { ...slide.blocks[1], id: "copy0003" },
      ],
    });
    expect(slide.id).toBe("slide001");
    expect(parseDeckContent({ v: 1, slides: [slide, copy] })).not.toBeNull();
  });
});
