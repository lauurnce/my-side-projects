import { describe, expect, it } from "vitest";
import type { ClassOutline, OutlineLesson } from "@/lib/routes";
import {
  classHref,
  editLessonHref,
  isLessonDone,
  lessonHref,
  lessonPlace,
  minutesLabel,
  placeLabel,
  progressLabel,
} from "./helpers";

function lesson(id: string, published: boolean, done = false): OutlineLesson {
  return { id, moduleId: "m", title: id, estMinutes: 5, published, done };
}

const outline: ClassOutline = {
  classId: "c",
  modules: [
    { id: "m1", classId: "c", title: "One", lessons: [lesson("a", true, true), lesson("draft", false, true)] },
    { id: "m2", classId: "c", title: "Two", lessons: [lesson("b", true), lesson("c", true)] },
  ],
};

describe("lessonPlace", () => {
  it("counts only published lessons, across modules", () => {
    expect(lessonPlace(outline, "a")).toEqual({ position: 1, total: 3 });
    expect(lessonPlace(outline, "b")).toEqual({ position: 2, total: 3 });
    expect(lessonPlace(outline, "c")).toEqual({ position: 3, total: 3 });
  });

  it("gives no place to a draft or an unknown lesson", () => {
    expect(lessonPlace(outline, "draft")).toBeNull();
    expect(lessonPlace(outline, "missing")).toBeNull();
    expect(lessonPlace({ classId: "c", modules: [] }, "a")).toBeNull();
  });
});

describe("isLessonDone", () => {
  it("is true only for a published lesson that is done", () => {
    expect(isLessonDone(outline, "a")).toBe(true);
    expect(isLessonDone(outline, "b")).toBe(false);
    expect(isLessonDone(outline, "draft")).toBe(false);
    expect(isLessonDone(outline, "missing")).toBe(false);
  });
});

describe("labels", () => {
  it("words the place, the minutes and the progress", () => {
    expect(placeLabel({ position: 2, total: 5 })).toBe("Lesson 2 of 5");
    expect(minutesLabel(8)).toBe("8 min read");
    expect(progressLabel({ done: 3, published: 5 })).toBe("3 of 5 lessons done");
    expect(progressLabel({ done: 0, published: 0 })).toBe("0 of 0 lessons done");
    expect(progressLabel({ done: 1, published: 1 })).toBe("1 of 1 lesson done");
  });
});

describe("links", () => {
  it("builds the class, lesson and edit paths", () => {
    expect(classHref("c1")).toBe("/classes/c1");
    expect(lessonHref("c1", "l1")).toBe("/classes/c1/lessons/l1");
    expect(editLessonHref("c1", "l1")).toBe("/classes/c1/lessons/l1/edit");
  });
});
