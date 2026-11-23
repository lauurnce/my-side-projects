import { describe, expect, it } from "vitest";
import { clampFrame, isArrowKey, keyFrame, moveFrame, resizeFrame, sameFrame } from "./geometry";

const frame = { x: 400, y: 300, w: 200, h: 100 };
const coarse = { fine: false, resize: false };

describe("moveFrame", () => {
  it("moves by the delta and keeps the size", () => {
    expect(moveFrame(frame, 50, -20)).toEqual({ x: 450, y: 280, w: 200, h: 100 });
  });

  it("stops at every canvas edge", () => {
    expect(moveFrame(frame, -5000, -5000)).toEqual({ x: 0, y: 0, w: 200, h: 100 });
    expect(moveFrame(frame, 5000, 5000)).toEqual({ x: 1400, y: 800, w: 200, h: 100 });
  });

  it("rounds a fractional delta", () => {
    expect(moveFrame(frame, 10.4, 10.6)).toEqual({ x: 410, y: 311, w: 200, h: 100 });
  });
});

describe("resizeFrame", () => {
  it("drags the south east corner and keeps the north west corner", () => {
    expect(resizeFrame(frame, "se", 40, 30)).toEqual({ x: 400, y: 300, w: 240, h: 130 });
  });

  it("drags the north west corner and keeps the south east corner", () => {
    expect(resizeFrame(frame, "nw", 40, 30)).toEqual({ x: 440, y: 330, w: 160, h: 70 });
  });

  it("drags the north east corner and keeps the south west corner", () => {
    expect(resizeFrame(frame, "ne", 40, 30)).toEqual({ x: 400, y: 330, w: 240, h: 70 });
  });

  it("drags the south west corner and keeps the north east corner", () => {
    expect(resizeFrame(frame, "sw", 40, 30)).toEqual({ x: 440, y: 300, w: 160, h: 130 });
  });

  it("never goes below the minimum size and keeps the fixed corner", () => {
    expect(resizeFrame(frame, "se", -5000, -5000)).toEqual({ x: 400, y: 300, w: 24, h: 24 });
    expect(resizeFrame(frame, "nw", 5000, 5000)).toEqual({ x: 576, y: 376, w: 24, h: 24 });
    expect(resizeFrame(frame, "ne", -5000, 5000)).toEqual({ x: 400, y: 376, w: 24, h: 24 });
    expect(resizeFrame(frame, "sw", 5000, -5000)).toEqual({ x: 576, y: 300, w: 24, h: 24 });
  });

  it("never leaves the canvas and keeps the fixed corner", () => {
    expect(resizeFrame(frame, "se", 5000, 5000)).toEqual({ x: 400, y: 300, w: 1200, h: 600 });
    expect(resizeFrame(frame, "nw", -5000, -5000)).toEqual({ x: 0, y: 0, w: 600, h: 400 });
    expect(resizeFrame(frame, "ne", 5000, -5000)).toEqual({ x: 400, y: 0, w: 1200, h: 400 });
    expect(resizeFrame(frame, "sw", -5000, 5000)).toEqual({ x: 0, y: 300, w: 600, h: 600 });
  });

  it("rounds a fractional delta", () => {
    expect(resizeFrame(frame, "se", 10.4, 10.6)).toEqual({ x: 400, y: 300, w: 210, h: 111 });
    expect(resizeFrame(frame, "nw", 10.4, 10.6)).toEqual({ x: 410, y: 311, w: 190, h: 89 });
  });

  it("rounds a fractional frame", () => {
    const resized = resizeFrame({ x: 10.4, y: 20.6, w: 100.2, h: 50.7 }, "se", 0, 0);
    expect(resized).toEqual({ x: 10, y: 21, w: 100, h: 51 });
  });
});

describe("keyFrame", () => {
  it("moves by 8 in each direction", () => {
    expect(keyFrame(frame, "ArrowRight", coarse)).toEqual({ ...frame, x: 408 });
    expect(keyFrame(frame, "ArrowLeft", coarse)).toEqual({ ...frame, x: 392 });
    expect(keyFrame(frame, "ArrowDown", coarse)).toEqual({ ...frame, y: 308 });
    expect(keyFrame(frame, "ArrowUp", coarse)).toEqual({ ...frame, y: 292 });
  });

  it("moves by 1 when fine", () => {
    expect(keyFrame(frame, "ArrowRight", { fine: true, resize: false })).toEqual({ ...frame, x: 401 });
    expect(keyFrame(frame, "ArrowUp", { fine: true, resize: false })).toEqual({ ...frame, y: 299 });
  });

  it("grows with right and down and shrinks with left and up when resizing", () => {
    expect(keyFrame(frame, "ArrowRight", { fine: false, resize: true })).toEqual({ ...frame, w: 208 });
    expect(keyFrame(frame, "ArrowDown", { fine: false, resize: true })).toEqual({ ...frame, h: 108 });
    expect(keyFrame(frame, "ArrowLeft", { fine: false, resize: true })).toEqual({ ...frame, w: 192 });
    expect(keyFrame(frame, "ArrowUp", { fine: true, resize: true })).toEqual({ ...frame, h: 99 });
  });

  it("does not move past an edge or shrink below the minimum", () => {
    const corner = { x: 0, y: 0, w: 24, h: 24 };
    expect(keyFrame(corner, "ArrowLeft", coarse)).toEqual(corner);
    expect(keyFrame(corner, "ArrowUp", { fine: false, resize: true })).toEqual(corner);
    const full = { x: 0, y: 0, w: 1600, h: 900 };
    expect(keyFrame(full, "ArrowRight", { fine: false, resize: true })).toEqual(full);
  });

  it("leaves the frame alone for any other key", () => {
    expect(keyFrame(frame, "a", coarse)).toEqual(frame);
  });
});

describe("helpers", () => {
  it("knows the arrow keys", () => {
    expect(isArrowKey("ArrowLeft")).toBe(true);
    expect(isArrowKey("Enter")).toBe(false);
  });

  it("compares frames by value", () => {
    expect(sameFrame(frame, { ...frame })).toBe(true);
    expect(sameFrame(frame, { ...frame, h: 101 })).toBe(false);
  });

  it("keeps clampFrame as it was", () => {
    expect(clampFrame({ x: -10, y: 880.4, w: 5, h: 2000 })).toEqual({ x: 0, y: 0, w: 24, h: 900 });
  });
});
