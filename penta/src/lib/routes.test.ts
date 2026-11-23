import { describe, expect, it } from "vitest";
import {
  buildOutlines,
  firstUnfinished,
  lessonNeighbours,
  outlineFor,
  progressCount,
} from "@/lib/routes";

const moduleRow = (id: string, position: number, classId = "class-a") => ({
  id,
  class_id: classId,
  title: `Module ${id}`,
  position,
});

const lessonRow = (id: string, moduleId: string, position: number, published = true) => ({
  id,
  module_id: moduleId,
  title: `Lesson ${id}`,
  position,
  est_minutes: 10,
  published_at: published ? "2026-11-21T00:00:00Z" : null,
});

const modules = [moduleRow("m2", 2), moduleRow("m1", 1), moduleRow("mb", 1, "class-b")];
const lessons = [
  lessonRow("l3", "m2", 1),
  lessonRow("l2", "m1", 2),
  lessonRow("l1", "m1", 1),
  lessonRow("draft", "m1", 3, false),
  lessonRow("lb", "mb", 1),
];

describe("buildOutlines", () => {
  it("groups by class and sorts modules and lessons by position", () => {
    const outline = outlineFor(buildOutlines(modules, lessons, []), "class-a");
    expect(outline.modules.map((item) => item.id)).toEqual(["m1", "m2"]);
    expect(outline.modules[0].lessons.map((lesson) => lesson.id)).toEqual(["l1", "l2", "draft"]);
  });

  it("marks done lessons and drafts", () => {
    const outline = outlineFor(buildOutlines(modules, lessons, ["l1"]), "class-a");
    const [first, , draft] = outline.modules[0].lessons;
    expect(first.done).toBe(true);
    expect(draft.published).toBe(false);
  });

  it("gives an empty outline for a class with no modules", () => {
    expect(outlineFor(buildOutlines(modules, lessons, []), "class-z")).toEqual({ classId: "class-z", modules: [] });
  });
});

describe("progressCount", () => {
  it("counts done out of published and ignores drafts", () => {
    const outline = outlineFor(buildOutlines(modules, lessons, ["l1", "l3"]), "class-a");
    expect(progressCount(outline)).toEqual({ done: 2, published: 3 });
  });

  it("never counts a done lesson that is no longer visible", () => {
    const visible = lessons.filter((lesson) => lesson.id !== "l2");
    const outline = outlineFor(buildOutlines(modules, visible, ["l1", "l2", "draft"]), "class-a");
    expect(progressCount(outline)).toEqual({ done: 1, published: 2 });
  });

  it("shows 1 of 1 after one of two done lessons is unpublished", () => {
    const rows = [lessonRow("l1", "m1", 1), lessonRow("l2", "m1", 2, false)];
    const outline = outlineFor(buildOutlines([moduleRow("m1", 1)], rows, ["l1", "l2"]), "class-a");
    expect(progressCount(outline)).toEqual({ done: 1, published: 1 });
  });
});

describe("firstUnfinished", () => {
  it("is the first published lesson not done, in module then lesson order", () => {
    const outline = outlineFor(buildOutlines(modules, lessons, ["l1"]), "class-a");
    expect(firstUnfinished(outline)?.id).toBe("l2");
  });

  it("skips drafts and is null when everything is done", () => {
    const outline = outlineFor(buildOutlines(modules, lessons, ["l1", "l2", "l3"]), "class-a");
    expect(firstUnfinished(outline)).toBeNull();
  });
});

describe("lessonNeighbours", () => {
  const outline = outlineFor(buildOutlines(modules, lessons, []), "class-a");

  it("crosses module borders and skips drafts", () => {
    const { previous, next } = lessonNeighbours(outline, "l2");
    expect(previous?.id).toBe("l1");
    expect(next?.id).toBe("l3");
  });

  it("has no previous at the start and no next at the end", () => {
    expect(lessonNeighbours(outline, "l1").previous).toBeNull();
    expect(lessonNeighbours(outline, "l3").next).toBeNull();
  });

  it("has neither for a lesson that is not in the published list", () => {
    expect(lessonNeighbours(outline, "draft")).toEqual({ previous: null, next: null });
  });
});
