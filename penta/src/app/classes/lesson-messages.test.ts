import { describe, expect, it } from "vitest";
import {
  lessonDoneError,
  lessonDoneMessages,
  lessonDoneSaved,
  lessonDoneSchema,
  progressErrorMessage,
} from "./lesson-messages";

const lessonId = "7b0f6a52-1c1d-4f6e-9d55-0d6d3a1f2c11";

describe("lessonDoneSchema", () => {
  it("reads done as a state, not a toggle", () => {
    expect(lessonDoneSchema.parse({ lessonId, done: "true" })).toEqual({ lessonId, done: true });
    expect(lessonDoneSchema.parse({ lessonId, done: "false" })).toEqual({ lessonId, done: false });
  });

  it("refuses an id that is not a uuid", () => {
    for (const bad of ["", "1", "not-a-uuid", `${lessonId}x`, null, undefined, 4]) {
      expect(lessonDoneSchema.safeParse({ lessonId: bad, done: "true" }).success).toBe(false);
    }
  });

  it("refuses any done value other than the two strings", () => {
    for (const bad of ["", "1", "yes", "TRUE", "toggle", true, false, null, undefined]) {
      expect(lessonDoneSchema.safeParse({ lessonId, done: bad }).success).toBe(false);
    }
  });
});

describe("progressErrorMessage", () => {
  it("says the lesson is gone for a refused or dangling write", () => {
    expect(progressErrorMessage("42501")).toBe("This lesson is no longer available.");
    expect(progressErrorMessage("23503")).toBe("This lesson is no longer available.");
  });

  it("gives the retry sentence for anything else", () => {
    for (const code of ["23505", "P0001", "PGRST116", "", null, undefined]) {
      expect(progressErrorMessage(code)).toBe("Could not save your progress. Try again.");
    }
  });
});

describe("lesson done states", () => {
  it("confirms the state that was set", () => {
    expect(lessonDoneSaved(true)).toEqual({ status: "saved", message: lessonDoneMessages.markedDone });
    expect(lessonDoneSaved(false)).toEqual({ status: "saved", message: lessonDoneMessages.markedNotDone });
  });

  it("wraps a failure", () => {
    expect(lessonDoneError(lessonDoneMessages.unavailable)).toEqual({
      status: "error",
      message: "This lesson is no longer available.",
    });
  });
});
