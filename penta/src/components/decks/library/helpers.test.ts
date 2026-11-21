import { describe, expect, it } from "vitest";
import type { DeckSummary } from "@/lib/decks";
import type { ClassOutline } from "@/lib/routes";
import {
  classCodes,
  deckCountLabel,
  deckEyebrow,
  deckHref,
  lessonDecks,
  readyDecks,
  slideCountLabel,
  viewedTotalsLabel,
  visibleLessonTitles,
} from "./helpers";

function deck(id: string, overrides: Partial<DeckSummary> = {}): DeckSummary {
  return {
    id,
    classId: "c1",
    lessonId: null,
    title: id,
    kind: "pdf",
    slideCount: 10,
    sizeBytes: 1000,
    ready: true,
    viewedCount: 0,
    ...overrides,
  };
}

const outline: ClassOutline = {
  classId: "c1",
  modules: [
    {
      id: "m1",
      classId: "c1",
      title: "One",
      lessons: [
        { id: "l1", moduleId: "m1", title: "Message queues", estMinutes: 5, published: true, done: false },
        { id: "l2", moduleId: "m1", title: "Hidden draft", estMinutes: 5, published: false, done: false },
      ],
    },
  ],
};

describe("labels", () => {
  it("words the deck count", () => {
    expect(deckCountLabel(0)).toBe("0 decks");
    expect(deckCountLabel(1)).toBe("1 deck");
    expect(deckCountLabel(3)).toBe("3 decks");
  });

  it("words the slide count", () => {
    expect(slideCountLabel(1)).toBe("1 slide");
    expect(slideCountLabel(24)).toBe("24 slides");
  });

  it("builds the viewer path", () => {
    expect(deckHref("d1")).toBe("/decks/d1");
  });
});

describe("deckEyebrow", () => {
  const titles = visibleLessonTitles(outline);

  it("lists only published lessons as visible", () => {
    expect([...titles]).toEqual([["l1", "Message queues"]]);
  });

  it("uses the lesson title for a deck linked to a visible lesson", () => {
    expect(deckEyebrow({ lessonId: "l1" }, titles, "INTE 301")).toBe("Message queues");
  });

  it("uses the class code with no lesson, a draft lesson or an unknown lesson", () => {
    expect(deckEyebrow({ lessonId: null }, titles, "INTE 301")).toBe("INTE 301");
    expect(deckEyebrow({ lessonId: "l2" }, titles, "INTE 301")).toBe("INTE 301");
    expect(deckEyebrow({ lessonId: "gone" }, titles, "INTE 301")).toBe("INTE 301");
  });
});

describe("classCodes", () => {
  it("maps each class id to its code", () => {
    const codes = classCodes([
      { id: "c1", code: "INTE 301" },
      { id: "c2", code: "COMP 018" },
    ]);
    expect(codes.get("c2")).toBe("COMP 018");
    expect(codes.get("missing")).toBeUndefined();
  });
});

describe("deck filters", () => {
  const decks = [
    deck("a", { lessonId: "l1" }),
    deck("b", { lessonId: "l1", ready: false }),
    deck("c", { lessonId: "l2" }),
    deck("d"),
    deck("e", { lessonId: "l1" }),
  ];

  it("keeps only ready decks", () => {
    expect(readyDecks(decks).map((item) => item.id)).toEqual(["a", "c", "d", "e"]);
  });

  it("keeps the ready decks linked to the lesson, in order", () => {
    expect(lessonDecks(decks, "l1").map((item) => item.id)).toEqual(["a", "e"]);
    expect(lessonDecks(decks, "l2").map((item) => item.id)).toEqual(["c"]);
  });

  it("gives nothing for a lesson with no deck", () => {
    expect(lessonDecks(decks, "l9")).toEqual([]);
    expect(lessonDecks([], "l1")).toEqual([]);
  });
});

describe("viewedTotalsLabel", () => {
  it("adds up viewed and total slides", () => {
    const decks = [deck("a", { slideCount: 24, viewedCount: 9 }), deck("b", { slideCount: 72, viewedCount: 22 })];
    expect(viewedTotalsLabel(decks)).toBe("Viewed 31 of 96 slides");
  });

  it("words one slide and none", () => {
    expect(viewedTotalsLabel([deck("a", { slideCount: 1, viewedCount: 1 })])).toBe("Viewed 1 of 1 slide");
    expect(viewedTotalsLabel([])).toBe("Viewed 0 of 0 slides");
  });
});
