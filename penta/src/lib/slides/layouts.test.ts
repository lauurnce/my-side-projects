import { describe, expect, it } from "vitest";
import { slideLimits } from "@/lib/config";
import { layoutBlocks, layoutLabels, layoutNames, newBlock, newImageBlock } from "./layouts";
import { parseDeckContent, type Block } from "./schema";

function countingIds() {
  const made: string[] = [];
  const makeId = () => {
    const id = `id${String(made.length).padStart(6, "0")}`;
    made.push(id);
    return id;
  };
  return { made, makeId };
}

function parses(blocks: Block[]) {
  return parseDeckContent({ v: 1, slides: [{ id: "slide001", blocks }] }) !== null;
}

describe("layoutBlocks", () => {
  it("has a label for every layout", () => {
    expect(Object.keys(layoutLabels)).toEqual([...layoutNames]);
  });

  it.each(layoutNames)("%s passes the deck schema", (name) => {
    const blocks = layoutBlocks(name, countingIds().makeId);
    expect(blocks.length).toBeGreaterThan(0);
    expect(parses(blocks)).toBe(true);
  });

  it.each(layoutNames)("%s takes every id from makeId and never repeats one", (name) => {
    const { made, makeId } = countingIds();
    const ids = layoutBlocks(name, makeId).map((block) => block.id);
    expect(ids).toEqual(made);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it.each(layoutNames)("%s keeps every block on the canvas inside the side margin, on whole pixels", (name) => {
    for (const block of layoutBlocks(name, countingIds().makeId)) {
      const numbers = [block.x, block.y, block.w, block.h];
      expect(numbers.every(Number.isInteger)).toBe(true);
      expect(block.x).toBeGreaterThanOrEqual(120);
      expect(block.x + block.w).toBeLessThanOrEqual(slideLimits.width - 120);
      expect(block.y).toBeGreaterThanOrEqual(0);
      expect(block.y + block.h).toBeLessThanOrEqual(slideLimits.height);
    }
  });

  it.each(layoutNames)("%s never uses gold and never leaves text empty", (name) => {
    for (const block of layoutBlocks(name, countingIds().makeId)) {
      if (block.type === "box") expect(block.fill).not.toBe("gold");
      if ("text" in block) expect(block.text.trim().length).toBeGreaterThan(0);
    }
  });

  it("title is one centered title with a text line under it", () => {
    const [title, line] = layoutBlocks("title", countingIds().makeId);
    expect([title.type, line.type]).toEqual(["title", "text"]);
    expect(line.y).toBeGreaterThanOrEqual(title.y + title.h);
    expect((title.y + line.y + line.h) / 2).toBe(slideLimits.height / 2);
  });

  it("titleText is a title with one text block under it", () => {
    const [title, text] = layoutBlocks("titleText", countingIds().makeId);
    expect([title.type, text.type]).toEqual(["title", "text"]);
    expect(text.y).toBeGreaterThanOrEqual(title.y + title.h);
  });

  it("twoColumns is a title with two text blocks side by side", () => {
    const [title, left, right] = layoutBlocks("twoColumns", countingIds().makeId);
    expect([title.type, left.type, right.type]).toEqual(["title", "text", "text"]);
    expect(left.y).toBe(right.y);
    expect(left.w).toBe(right.w);
    expect(right.x).toBeGreaterThanOrEqual(left.x + left.w);
  });

  it("threeBoxes has three boxes, two arrows between them and one ink box in the middle", () => {
    const blocks = layoutBlocks("threeBoxes", countingIds().makeId);
    const boxes = blocks.filter((block) => block.type === "box");
    const arrows = blocks.filter((block) => block.type === "arrow");
    expect(boxes.map((box) => box.text)).toEqual(["Producer", "Broker", "Consumer"]);
    expect(boxes.map((box) => box.fill)).toEqual(["none", "ink", "none"]);
    expect(arrows).toHaveLength(2);
    expect(arrows.every((arrow) => arrow.direction === "right")).toBe(true);
    expect(arrows[0].x).toBeGreaterThanOrEqual(boxes[0].x + boxes[0].w);
    expect(arrows[0].x + arrows[0].w).toBeLessThanOrEqual(boxes[1].x);
    expect(arrows[1].x).toBeGreaterThanOrEqual(boxes[1].x + boxes[1].w);
    expect(arrows[1].x + arrows[1].w).toBeLessThanOrEqual(boxes[2].x);
    expect(blocks.filter((block) => block.type === "text")).toHaveLength(2);
  });
});

describe("newBlock and newImageBlock", () => {
  it.each(["title", "text", "box", "arrow"] as const)("makes a valid %s block with the given id", (type) => {
    const { made, makeId } = countingIds();
    const block = newBlock(type, makeId);
    expect(block.type).toBe(type);
    expect(block.id).toBe(made[0]);
    expect(parses([block])).toBe(true);
  });

  it("makes a valid image block for a stored file", () => {
    const block = newImageBlock("0a1b2c3d-0000-4000-8000-0123456789ab.png", countingIds().makeId);
    expect(block.type).toBe("image");
    expect(parses([block])).toBe(true);
  });
});
