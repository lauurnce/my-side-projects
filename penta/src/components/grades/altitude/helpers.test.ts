import { describe, expect, it } from "vitest";
import type { ClassAltitude } from "@/lib/grades";
import {
  altitudeLine,
  anyClassCounts,
  basisNote,
  breakdownText,
  classMeters,
  countedParts,
  leftOutText,
  weightsSentence,
} from "./helpers";

function classAltitude(overrides: Partial<ClassAltitude> = {}): ClassAltitude {
  return {
    classId: "c1",
    counts: true,
    meters: 1708,
    lessonsDone: 1,
    lessonsPublished: 3,
    decksFinished: 1,
    decks: 2,
    pointsEarned: 21,
    pointsPossible: 25,
    ...overrides,
  };
}

const noLessons = { lessonsDone: 0, lessonsPublished: 0 };
const noDecks = { decksFinished: 0, decks: 0 };
const noPoints = { pointsEarned: 0, pointsPossible: 0 };
const nothing = classAltitude({ counts: false, meters: 0, ...noLessons, ...noDecks, ...noPoints });

describe("breakdownText and basisNote", () => {
  it("names all three parts with no note when all count", () => {
    const all = classAltitude();
    expect(breakdownText(all)).toBe("Lessons 1 of 3 · Decks 1 of 2 · Points 21 of 25");
    expect(basisNote(all)).toBeNull();
  });

  it("covers lessons and decks", () => {
    const item = classAltitude(noPoints);
    expect(breakdownText(item)).toBe("Lessons 1 of 3 · Decks 1 of 2 · No graded work yet");
    expect(basisNote(item)).toBe("Based on lessons and decks.");
  });

  it("covers lessons and graded work", () => {
    const item = classAltitude(noDecks);
    expect(breakdownText(item)).toBe("Lessons 1 of 3 · No decks yet · Points 21 of 25");
    expect(basisNote(item)).toBe("Based on lessons and graded work.");
  });

  it("covers decks and graded work", () => {
    const item = classAltitude(noLessons);
    expect(breakdownText(item)).toBe("No lessons yet · Decks 1 of 2 · Points 21 of 25");
    expect(basisNote(item)).toBe("Based on decks and graded work.");
  });

  it("covers lessons only", () => {
    const item = classAltitude({ ...noDecks, ...noPoints });
    expect(breakdownText(item)).toBe("Lessons 1 of 3 · No decks yet · No graded work yet");
    expect(basisNote(item)).toBe("Based on lessons only.");
  });

  it("covers decks only", () => {
    const item = classAltitude({ ...noLessons, ...noPoints });
    expect(breakdownText(item)).toBe("No lessons yet · Decks 1 of 2 · No graded work yet");
    expect(basisNote(item)).toBe("Based on decks only.");
  });

  it("covers graded work only", () => {
    const item = classAltitude({ ...noLessons, ...noDecks });
    expect(breakdownText(item)).toBe("No lessons yet · No decks yet · Points 21 of 25");
    expect(basisNote(item)).toBe("Based on graded work only.");
  });

  it("says a class with nothing is left out, also when it is unknown", () => {
    expect(breakdownText(nothing)).toBe(leftOutText);
    expect(basisNote(nothing)).toBeNull();
    expect(breakdownText(null)).toBe("Nothing to count yet. This class is left out of your average.");
    expect(basisNote(null)).toBeNull();
    expect(countedParts(nothing)).toEqual([]);
  });

  it("trusts the database when it says a class does not count", () => {
    expect(breakdownText(classAltitude({ counts: false }))).toBe(leftOutText);
  });
});

describe("classMeters and anyClassCounts", () => {
  const altitude = { overall: 1708, classes: [classAltitude(), { ...nothing, classId: "c2", meters: 900 }] };

  it("reads the meters of a class that counts", () => {
    expect(classMeters(altitude, "c1")).toBe(1708);
  });

  it("is 0 for a class that does not count or is unknown", () => {
    expect(classMeters(altitude, "c2")).toBe(0);
    expect(classMeters(altitude, "c9")).toBe(0);
  });

  it("knows whether any class counts", () => {
    expect(anyClassCounts(altitude)).toBe(true);
    expect(anyClassCounts({ overall: 0, classes: [nothing] })).toBe(false);
    expect(anyClassCounts({ overall: 0, classes: [] })).toBe(false);
  });
});

describe("sentences", () => {
  it("builds the altitude line", () => {
    expect(altitudeLine(1700)).toBe("1,700 m of 3,000 m");
    expect(altitudeLine(0)).toBe("0 m of 3,000 m");
  });

  it("builds the weights sentence from the config", () => {
    expect(weightsSentence()).toBe(
      "Altitude is progress, not a grade. Lessons count for 1,200 m, decks for 600 m and graded work for 1,200 m. A part with nothing to count is skipped and the rest is scaled up.",
    );
  });
});
