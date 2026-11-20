import { describe, expect, it } from "vitest";
import {
  activeLayer,
  clamp01,
  coverProgress,
  heroProgress,
  layerScrollTop,
  plateDrop,
  scrollBehavior,
  stackProgress,
  type Layer,
} from "@/lib/scroll-math";

const drops = (progress: number, reducedMotion = false) =>
  ([1, 2, 3] as Layer[]).map((layer) => plateDrop(progress, layer, reducedMotion));

describe("clamp01", () => {
  it("keeps values between 0 and 1", () => {
    expect(clamp01(-2)).toBe(0);
    expect(clamp01(0.4)).toBe(0.4);
    expect(clamp01(7)).toBe(1);
    expect(clamp01(Number.NaN)).toBe(0);
    expect(clamp01(-0)).toBe(0);
  });
});

describe("stackProgress", () => {
  it("runs from 0 to 1 across the wrapper minus the stage", () => {
    expect(stackProgress(100, 2600, 900)).toBe(0);
    expect(stackProgress(0, 2600, 900)).toBe(0);
    expect(stackProgress(-850, 2600, 900)).toBe(0.5);
    expect(stackProgress(-1700, 2600, 900)).toBe(1);
    expect(stackProgress(-5000, 2600, 900)).toBe(1);
  });

  it("does not divide by zero when the wrapper is as tall as the stage", () => {
    expect(stackProgress(-10, 900, 900)).toBe(1);
  });
});

describe("plateDrop", () => {
  it.each([
    [0, [0, 0, 0]],
    [0.1, [0.578, 0, 0]],
    [0.2, [0.963, 0, 0]],
    [0.48, [1, 0.875, 0]],
    [0.8, [1, 1, 0.875]],
    [1, [1, 1, 1]],
  ])("matches the measured values at p %f", (progress, expected) => {
    drops(progress).forEach((value, index) => expect(value).toBeCloseTo(expected[index], 3));
  });

  it("jumps from 0 to 1 with no drop under reduced motion", () => {
    expect(drops(0.04, true)).toEqual([0, 0, 0]);
    expect(drops(0.05, true)).toEqual([1, 0, 0]);
    expect(drops(0.48, true)).toEqual([1, 1, 0]);
    expect(drops(0.7, true)).toEqual([1, 1, 1]);
  });
});

describe("activeLayer", () => {
  it("switches at 0.33 and 0.66", () => {
    expect(activeLayer(0)).toBe(1);
    expect(activeLayer(0.329)).toBe(1);
    expect(activeLayer(0.33)).toBe(2);
    expect(activeLayer(0.659)).toBe(2);
    expect(activeLayer(0.66)).toBe(3);
    expect(activeLayer(1)).toBe(3);
  });
});

describe("coverProgress", () => {
  it("is 0.55 when the next panel is 55% up the screen", () => {
    expect(coverProgress(900 * 0.45, 900)).toBeCloseTo(0.55, 5);
  });

  it("stays between 0 and 1", () => {
    expect(coverProgress(1800, 900)).toBe(0);
    expect(coverProgress(-300, 900)).toBe(1);
  });
});

describe("heroProgress", () => {
  it("follows the hero as it leaves the top of the screen", () => {
    expect(heroProgress(0, 960)).toBe(0);
    expect(heroProgress(-480, 960)).toBe(0.5);
    expect(heroProgress(-2000, 960)).toBe(1);
  });
});

describe("layerScrollTop", () => {
  it("targets p 0.22, 0.54 and 0.86 of the wrapper", () => {
    expect(layerScrollTop(0, 960, 2600, 900, 1)).toBeCloseTo(960 + 0.22 * 1700, 5);
    expect(layerScrollTop(0, 960, 2600, 900, 2)).toBeCloseTo(960 + 0.54 * 1700, 5);
    expect(layerScrollTop(500, 460, 2600, 900, 3)).toBeCloseTo(960 + 0.86 * 1700, 5);
  });
});

describe("scrollBehavior", () => {
  it("is smooth, and instant under reduced motion", () => {
    expect(scrollBehavior(false)).toBe("smooth");
    expect(scrollBehavior(true)).toBe("auto");
  });
});
