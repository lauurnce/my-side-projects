import { describe, expect, it } from "vitest";
import {
  canvasLimits,
  canvasSize,
  centeredScroll,
  clampSlide,
  isTypingTarget,
  markerLabel,
  markerState,
  slideAnnouncement,
  slideForKey,
  slideText,
  swipeStep,
} from "./helpers";

describe("clampSlide", () => {
  it("keeps a slide inside the deck", () => {
    expect(clampSlide(0, 24)).toBe(1);
    expect(clampSlide(3, 24)).toBe(3);
    expect(clampSlide(25, 24)).toBe(24);
    expect(clampSlide(5, 0)).toBe(1);
  });
});

describe("slideForKey", () => {
  it("maps the navigation keys", () => {
    expect(slideForKey("ArrowRight", 3, 24)).toBe(4);
    expect(slideForKey("PageDown", 3, 24)).toBe(4);
    expect(slideForKey("ArrowLeft", 3, 24)).toBe(2);
    expect(slideForKey("PageUp", 3, 24)).toBe(2);
    expect(slideForKey("Home", 3, 24)).toBe(1);
    expect(slideForKey("End", 3, 24)).toBe(24);
  });

  it("stops at both ends", () => {
    expect(slideForKey("ArrowLeft", 1, 24)).toBe(1);
    expect(slideForKey("ArrowRight", 24, 24)).toBe(24);
  });

  it("ignores every other key", () => {
    expect(slideForKey("a", 3, 24)).toBeNull();
    expect(slideForKey("Enter", 3, 24)).toBeNull();
    expect(slideForKey(" ", 3, 24)).toBeNull();
  });
});

describe("isTypingTarget", () => {
  it("is true for form fields only", () => {
    expect(isTypingTarget(document.createElement("input"))).toBe(true);
    expect(isTypingTarget(document.createElement("select"))).toBe(true);
    expect(isTypingTarget(document.createElement("textarea"))).toBe(true);
    expect(isTypingTarget(document.createElement("button"))).toBe(false);
    expect(isTypingTarget(null)).toBe(false);
  });
});

describe("swipeStep", () => {
  it("goes forward on a swipe to the left and back on a swipe to the right", () => {
    expect(swipeStep(-80, 5)).toBe(1);
    expect(swipeStep(80, -5)).toBe(-1);
  });

  it("ignores short and mostly vertical moves", () => {
    expect(swipeStep(-20, 0)).toBe(0);
    expect(swipeStep(-60, 90)).toBe(0);
  });
});

describe("canvasSize", () => {
  it("fits a wide page into the box", () => {
    expect(canvasSize({ width: 960, height: 540 }, { width: 480, height: 270 }, 1)).toEqual({
      width: 480,
      height: 270,
      scale: 0.5,
    });
  });

  it("letterboxes a 4:3 page by height", () => {
    const size = canvasSize({ width: 800, height: 600 }, { width: 960, height: 540 }, 1);
    expect(size).toEqual({ width: 720, height: 540, scale: 0.9 });
  });

  it("letterboxes a portrait page by height", () => {
    const size = canvasSize({ width: 600, height: 800 }, { width: 960, height: 540 }, 1);
    expect(size?.height).toBe(540);
    expect(size?.width).toBe(405);
  });

  it("multiplies by the pixel ratio up to 2", () => {
    const box = { width: 480, height: 270 };
    const page = { width: 960, height: 540 };
    expect(canvasSize(page, box, 2)?.width).toBe(960);
    expect(canvasSize(page, box, 3)?.width).toBe(960);
    expect(canvasSize(page, box, 0.5)?.width).toBe(480);
  });

  it("clamps the pixel area and keeps the aspect ratio", () => {
    const size = canvasSize({ width: 960, height: 540 }, { width: 1920, height: 1080 }, 2);
    expect(size).not.toBeNull();
    if (!size) return;
    expect(size.width * size.height).toBeLessThanOrEqual(canvasLimits.pixelsMax);
    expect(size.width * size.height).toBeGreaterThan(canvasLimits.pixelsMax * 0.98);
    expect(size.width / size.height).toBeCloseTo(16 / 9, 2);
  });

  it("returns null for an empty box or page", () => {
    expect(canvasSize({ width: 960, height: 540 }, { width: 0, height: 0 }, 1)).toBeNull();
    expect(canvasSize({ width: 0, height: 540 }, { width: 480, height: 270 }, 1)).toBeNull();
  });
});

describe("slideText", () => {
  it("breaks lines where an item ends a line and collapses whitespace", () => {
    const parts = [
      { str: "Message", hasEOL: false },
      { str: "   queues ", hasEOL: true },
      { str: "", hasEOL: true },
      { str: "A queue\tholds  work", hasEOL: false },
    ];
    expect(slideText(parts)).toBe("Message queues\nA queue holds work");
  });

  it("skips marked content and returns an empty string for no text", () => {
    expect(slideText([{}, { str: "  ", hasEOL: true }])).toBe("");
    expect(slideText([])).toBe("");
  });
});

describe("slideAnnouncement", () => {
  it("leads with the position", () => {
    expect(slideAnnouncement(3, 24, "Message queues")).toBe("Slide 3 of 24. Message queues");
  });

  it("says so when the slide has no text", () => {
    expect(slideAnnouncement(3, 24, "")).toBe(
      "Slide 3 of 24. No readable text on this slide. Download the file to read it.",
    );
  });
});

describe("markers", () => {
  it("puts current before viewed before idle", () => {
    const seen = new Set([1, 2]);
    expect(markerState(2, 2, seen)).toBe("current");
    expect(markerState(1, 2, seen)).toBe("viewed");
    expect(markerState(3, 2, seen)).toBe("idle");
  });

  it("labels a viewed slide", () => {
    expect(markerLabel(3, true)).toBe("Slide 3, viewed");
    expect(markerLabel(3, false)).toBe("Slide 3");
  });

  it("centres the current marker and never scrolls below zero", () => {
    expect(centeredScroll(500, 44, 300)).toBe(372);
    expect(centeredScroll(10, 44, 300)).toBe(0);
  });
});
