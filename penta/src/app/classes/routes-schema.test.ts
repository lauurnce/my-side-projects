import { describe, expect, it } from "vitest";
import {
  addLessonSchema,
  addModuleSchema,
  lessonTargetSchema,
  moduleTargetSchema,
  moveLessonSchema,
  moveModuleSchema,
  moveResultState,
  outlineIntentSchema,
  renameModuleSchema,
  routeMessages,
  saveFieldErrors,
  saveLessonContentSchema,
  saveLessonTargetSchema,
  setLessonPublishedSchema,
  titleErrorMessage,
  writeErrorMessage,
} from "./routes-schema";

const id = "3f2b8c1e-6a4d-4e5f-9b7a-1c2d3e4f5a6b";

describe("outline input schemas", () => {
  it("accepts a module title and trims it", () => {
    expect(addModuleSchema.parse({ classId: id, title: "  Week 1  " })).toEqual({ classId: id, title: "Week 1" });
    expect(renameModuleSchema.parse({ moduleId: id, title: "Week 2" })).toEqual({ moduleId: id, title: "Week 2" });
  });

  it("refuses ids that are not uuids, missing values and files", () => {
    expect(addModuleSchema.safeParse({ classId: "1 or 1=1", title: "Week 1" }).success).toBe(false);
    expect(moduleTargetSchema.safeParse({ moduleId: null }).success).toBe(false);
    expect(lessonTargetSchema.safeParse({ lessonId: "" }).success).toBe(false);
    expect(lessonTargetSchema.safeParse({ lessonId: new File(["x"], "x.txt") }).success).toBe(false);
  });

  it("refuses empty and oversized titles", () => {
    expect(addModuleSchema.safeParse({ classId: id, title: "   " }).success).toBe(false);
    expect(addModuleSchema.safeParse({ classId: id, title: "a".repeat(121) }).success).toBe(false);
    expect(addLessonSchema.safeParse({ moduleId: id, title: "a".repeat(160) }).success).toBe(true);
    expect(addLessonSchema.safeParse({ moduleId: id, title: "a".repeat(161) }).success).toBe(false);
  });

  it("turns a direction into a step and refuses anything else", () => {
    expect(moveModuleSchema.parse({ moduleId: id, step: "up" })).toEqual({ moduleId: id, step: -1 });
    expect(moveLessonSchema.parse({ lessonId: id, step: "down" })).toEqual({ lessonId: id, step: 1 });
    expect(moveLessonSchema.safeParse({ lessonId: id, step: "5" }).success).toBe(false);
    expect(moveModuleSchema.safeParse({ moduleId: id, step: null }).success).toBe(false);
  });

  it("reads the publish flag only from true or false", () => {
    expect(setLessonPublishedSchema.parse({ lessonId: id, published: "true" }).published).toBe(true);
    expect(setLessonPublishedSchema.parse({ lessonId: id, published: "false" }).published).toBe(false);
    expect(setLessonPublishedSchema.safeParse({ lessonId: id, published: "yes" }).success).toBe(false);
  });

  it("knows every outline intent and refuses unknown ones", () => {
    expect(outlineIntentSchema.safeParse("deleteLesson").success).toBe(true);
    expect(outlineIntentSchema.safeParse("saveLesson").success).toBe(false);
    expect(outlineIntentSchema.safeParse(null).success).toBe(false);
  });
});

describe("save lesson schemas", () => {
  it("reads the revision as a whole number", () => {
    expect(saveLessonTargetSchema.parse({ lessonId: id, revision: "7" })).toEqual({ lessonId: id, revision: 7 });
    for (const revision of ["", "-1", "1.5", "abc", null]) {
      expect(saveLessonTargetSchema.safeParse({ lessonId: id, revision }).success).toBe(false);
    }
  });

  it("accepts a lesson and keeps the whole body", () => {
    const body = "# Title\r\n\r\n" + "word ".repeat(9000);
    const parsed = saveLessonContentSchema.parse({ title: " Message brokers ", minutes: "15", body });
    expect(parsed.title).toBe("Message brokers");
    expect(parsed.minutes).toBe(15);
    expect(parsed.body).toBe(body.replace(/\r\n/g, "\n"));
  });

  it("gives one message per failing field", () => {
    const parsed = saveLessonContentSchema.safeParse({ title: "", minutes: "0", body: "a".repeat(50001) });
    expect(parsed.success).toBe(false);
    if (parsed.success) return;
    expect(saveFieldErrors(parsed.error)).toEqual({
      title: "Enter a lesson title",
      minutes: "Enter at least 1 minute",
      body: "Use 50,000 characters or fewer",
    });
  });

  it("refuses minutes above the limit and an empty body is fine", () => {
    expect(saveLessonContentSchema.safeParse({ title: "A", minutes: "601", body: "" }).success).toBe(false);
    expect(saveLessonContentSchema.safeParse({ title: "A", minutes: "600", body: "" }).success).toBe(true);
  });
});

describe("message mapping", () => {
  it("maps the limit errors by name", () => {
    expect(writeErrorMessage({ code: "P0001", message: "module_limit" })).toBe("A class can have 30 modules at most.");
    expect(writeErrorMessage({ code: "P0001", message: "lesson_limit" })).toBe(
      "A module can have 60 lessons at most.",
    );
  });

  it("maps a refused delete to the sentence for that item", () => {
    expect(writeErrorMessage({ code: "23503" }, routeMessages.moduleHasLessons)).toBe(
      "Delete or unpublish its lessons first. A module with lessons cannot be deleted.",
    );
    expect(writeErrorMessage({ code: "23503" }, routeMessages.lessonHasProgress)).toBe(
      "Students have completed this lesson, so it cannot be deleted. Unpublish it instead.",
    );
  });

  it("names the linked deck when a lesson delete is refused by one", () => {
    const error = { code: "23503", message: 'violates foreign key constraint "decks_lesson_id_fkey" on table "decks"' };
    expect(writeErrorMessage(error, routeMessages.lessonHasProgress)).toBe(
      "A deck is linked to this lesson. Unlink or delete the deck first.",
    );
  });

  it("names the questions when a lesson delete is refused by a thread", () => {
    const error = { code: "23503", message: 'violates foreign key constraint "threads_lesson_id_fkey" on table "threads"' };
    expect(writeErrorMessage(error, routeMessages.lessonHasProgress)).toBe(
      "Students have asked questions on this lesson, so it cannot be deleted. Unpublish it instead.",
    );
  });

  it("treats zero rows without an error as gone", () => {
    expect(writeErrorMessage(null)).toBe("That item is no longer here. Reload the page.");
  });

  it("never passes a raw database message through", () => {
    const raw = 'relation "secret_table" does not exist';
    expect(writeErrorMessage({ code: "42P01", message: raw })).toBe(routeMessages.failed);
    expect(writeErrorMessage({ code: "P0001", message: raw })).toBe(routeMessages.failed);
    expect(writeErrorMessage({ code: "42501", message: raw })).toBe(routeMessages.refused);
    expect(writeErrorMessage({ code: "23514", message: raw })).toBe(routeMessages.rejectedText);
  });

  it("maps move results, with the edge as a quiet no-op", () => {
    expect(moveResultState("moved")).toEqual({ tone: "status", message: "Moved" });
    expect(moveResultState("edge")).toEqual({});
    expect(moveResultState("not_found")).toEqual({
      tone: "alert",
      message: "That item is no longer here. Reload the page.",
    });
    expect(moveResultState(null)).toEqual({ tone: "alert", message: routeMessages.failed });
  });

  it("prefers the title message and falls back to gone for a bad id", () => {
    const badTitle = addModuleSchema.safeParse({ classId: id, title: "" });
    const badId = addModuleSchema.safeParse({ classId: "nope", title: "Week 1" });
    expect(!badTitle.success && titleErrorMessage(badTitle.error)).toBe("Enter a module title");
    expect(!badId.success && titleErrorMessage(badId.error)).toBe(routeMessages.gone);
  });
});
