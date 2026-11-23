import { describe, expect, it } from "vitest";
import {
  badScoreMessage,
  createErrorMessage,
  createUploadSchema,
  feedbackFits,
  gradeFromForm,
  gradeState,
  gradeTargetSchema,
  parsePoints,
  parseScore,
  removedFilesMessage,
  setUploadPublishedSchema,
  uploadIntentSchema,
  uploadMessages,
  uploadSettingsErrorState,
  uploadSettingsFieldErrors,
  uploadSettingsFromForm,
  uploadSettingsSchema,
  uploadSettingsValues,
  uploadWriteErrorMessage,
  type UploadSettingsValues,
} from "./grading-schema";

const classId = "3f2b8c1e-6a4d-4e5f-9b7a-1c2d3e4f5a6b";
const lessonId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

const valid: UploadSettingsValues = {
  title: "Essay 1",
  instructions: "Hand in **one** file.",
  points: "20",
  dueAt: "2026-11-30T23:59",
  lessonId,
};

function settingsErrors(changes: Partial<UploadSettingsValues>) {
  const parsed = uploadSettingsSchema.safeParse({ ...valid, ...changes });
  return parsed.success ? {} : uploadSettingsFieldErrors(parsed.error);
}

function formOf(fields: Record<string, string>): FormData {
  const formData = new FormData();
  for (const [name, value] of Object.entries(fields)) formData.set(name, value);
  return formData;
}

describe("upload settings", () => {
  it("accepts valid settings and reads the due date as Manila time", () => {
    expect(uploadSettingsSchema.parse(valid)).toEqual({
      title: "Essay 1",
      instructions: "Hand in **one** file.",
      points: 20,
      dueAt: "2026-11-30T15:59:00.000Z",
      lessonId,
    });
  });

  it("treats an empty due date and an empty lesson as none", () => {
    const parsed = uploadSettingsSchema.parse({ ...valid, dueAt: "", lessonId: "" });
    expect([parsed.dueAt, parsed.lessonId]).toEqual([null, null]);
  });

  it.each(["2026-02-30T10:00", "2026-11-30", "tomorrow", "2026-11-30T25:00"])("refuses the date %s", (dueAt) => {
    expect(settingsErrors({ dueAt })).toEqual({ dueAt: "Enter a real date and time" });
  });

  it.each(["0", "1001", "1.5", "-3", "", "ten", "1e2", "12345"])("refuses %s points", (points) => {
    expect(settingsErrors({ points })).toEqual({ points: "Enter points from 1 to 1,000." });
  });

  it.each([
    ["1", 1],
    ["1000", 1000],
    [" 20 ", 20],
  ])("accepts %s points", (points, expected) => {
    expect(uploadSettingsSchema.parse({ ...valid, points }).points).toBe(expected);
    expect(parsePoints(points)).toBe(expected);
  });

  it("normalizes line breaks in the instructions", () => {
    expect(uploadSettingsSchema.parse({ ...valid, instructions: "One\r\nTwo\rThree" }).instructions).toBe(
      "One\nTwo\nThree",
    );
    const fromForm = uploadSettingsFromForm(formOf({ title: "Essay", instructions: "One\r\nTwo", points: "5" }));
    expect(fromForm).toEqual({ title: "Essay", instructions: "One\nTwo", points: "5", dueAt: "", lessonId: "" });
  });

  it("refuses an empty title, a long title, hidden characters and a bad lesson", () => {
    expect(settingsErrors({ title: "   " })).toEqual({ title: "Enter an activity title" });
    expect(settingsErrors({ title: "a".repeat(161) })).toEqual({ title: "Use 160 characters or fewer" });
    expect(settingsErrors({ title: "Essay‮1" })).toEqual({ title: "Remove hidden or control characters" });
    expect(settingsErrors({ instructions: "a".repeat(10001) })).toEqual({
      instructions: "Use 10,000 characters or fewer",
    });
    expect(settingsErrors({ lessonId: "nope" })).toEqual({ lessonId: "Choose one from the list" });
  });

  it("prefills from the activity with the due date as the Manila minute", () => {
    const values = uploadSettingsValues({
      id: "11111111-1111-4111-8111-111111111111",
      classId,
      type: "upload",
      lessonId: null,
      title: "Essay 1",
      instructionsMd: "Read it.",
      points: 20,
      dueAt: "2026-11-30T15:59:00.000Z",
      publishedAt: null,
      requiresDeckId: null,
      attemptLimit: 1,
      timeLimitMin: null,
      showAnswers: "never",
    });
    expect(values).toEqual({
      title: "Essay 1",
      instructions: "Read it.",
      points: "20",
      dueAt: "2026-11-30T23:59",
      lessonId: "",
    });
  });
});

describe("creating an upload activity", () => {
  it("accepts a class, a title and points", () => {
    expect(createUploadSchema.parse({ classId, title: " Essay 1 ", points: "50" })).toEqual({
      classId,
      title: "Essay 1",
      points: 50,
    });
  });

  it("names the first problem", () => {
    const message = (input: unknown) => {
      const parsed = createUploadSchema.safeParse(input);
      return parsed.success ? null : createErrorMessage(parsed.error);
    };
    expect(message({ classId, title: "", points: "50" })).toBe("Enter an activity title");
    expect(message({ classId, title: "Essay", points: "0" })).toBe("Enter points from 1 to 1,000.");
    expect(message({ classId, title: "Essay", points: null })).toBe("Enter points from 1 to 1,000.");
    expect(message({ classId: "x", title: "Essay", points: "5" })).toBe(uploadMessages.gone);
  });
});

describe("targets and intents", () => {
  it("reads the published flag", () => {
    const activityId = classId;
    expect(setUploadPublishedSchema.parse({ activityId, published: "true" }).published).toBe(true);
    expect(setUploadPublishedSchema.parse({ activityId, published: "false" }).published).toBe(false);
    expect(setUploadPublishedSchema.safeParse({ activityId, published: "yes" }).success).toBe(false);
  });

  it("needs two ids to grade", () => {
    expect(gradeTargetSchema.safeParse({ submissionId: classId, expectedUpload: lessonId }).success).toBe(true);
    expect(gradeTargetSchema.safeParse({ submissionId: classId, expectedUpload: "" }).success).toBe(false);
  });

  it("knows only its own intents", () => {
    expect(uploadIntentSchema.safeParse("removeGradedFiles").success).toBe(true);
    expect(uploadIntentSchema.safeParse("deleteQuiz").success).toBe(false);
  });
});

describe("score parsing", () => {
  it.each([
    ["0", 0],
    ["17", 17],
    [" 20 ", 20],
    ["007", 7],
  ])("reads %s", (text, expected) => {
    expect(parseScore(text)).toBe(expected);
  });

  it.each(["", "   ", "17.5", "17.0", "-1", "+5", "1e2", "ten", "12345", "1 2"])("refuses %j", (text) => {
    expect(parseScore(text)).toBeNull();
  });

  it("reads the grade fields from a form and normalizes line breaks", () => {
    expect(gradeFromForm(formOf({ score: "18", feedback: "Good.\r\nCite sources." }))).toEqual({
      score: "18",
      feedback: "Good.\nCite sources.",
    });
    expect(gradeFromForm(new FormData())).toEqual({ score: "", feedback: "" });
  });

  it("limits feedback to 5,000 characters after trimming", () => {
    expect(feedbackFits("a".repeat(5000))).toBe(true);
    expect(feedbackFits(` ${"a".repeat(5000)}\n`)).toBe(true);
    expect(feedbackFits("a".repeat(5001))).toBe(false);
  });
});

describe("grade_submission replies", () => {
  it("maps every status to its sentence", () => {
    expect(gradeState({ status: "graded", regrade: false }, 20)).toEqual({ tone: "status", message: "Grade saved" });
    expect(gradeState({ status: "graded", regrade: true }, 20)).toEqual({ tone: "status", message: "Grade changed" });
    expect(gradeState({ status: "changed" }, 20)).toEqual({
      tone: "alert",
      message: "The student replaced the file after you opened this page. Reload, open the new file, then grade.",
    });
    expect(gradeState({ status: "bad_score", points: 30 }, 20)).toEqual({
      tone: "alert",
      message: "Enter a whole number from 0 to 30.",
      field: "score",
    });
    expect(gradeState({ status: "bad_score" }, 20).message).toBe("Enter a whole number from 0 to 20.");
    expect(gradeState({ status: "bad_feedback" }, 20)).toEqual({
      tone: "alert",
      message: "Feedback can be 5,000 characters at most.",
      field: "feedback",
    });
    expect(gradeState({ status: "refused" }, 20)).toEqual({
      tone: "alert",
      message: "That submission is no longer here.",
    });
  });

  it.each([null, "graded", { status: "other" }, 7])("treats %j as a failure", (reply) => {
    expect(gradeState(reply, 20)).toEqual({ tone: "alert", message: uploadMessages.failed });
  });

  it("writes the score range with the points", () => {
    expect(badScoreMessage(1000)).toBe("Enter a whole number from 0 to 1,000.");
  });
});

describe("database refusals", () => {
  const raised = (message: string) => ({ code: "23514", message });

  it("maps each refusal to a fixed sentence", () => {
    expect(uploadWriteErrorMessage(raised("activity_has_attempts"))).toBe(
      "Students have handed in work, so this activity cannot be unpublished.",
    );
    expect(uploadWriteErrorMessage(raised("activity_has_grades"))).toBe(
      "Points cannot change after work has been graded.",
    );
    expect(uploadWriteErrorMessage(raised("activity_points_range"))).toBe("Enter points from 1 to 1,000.");
    expect(uploadWriteErrorMessage(raised("activity_lesson_outside_class"))).toBe(uploadMessages.lessonOutsideClass);
    expect(uploadWriteErrorMessage(raised("activities_title_check"))).toBe(uploadMessages.rejected);
    expect(uploadWriteErrorMessage({ code: "23503", message: "submissions_activity_id_fkey" })).toBe(
      "Students have handed in work, so this activity cannot be deleted.",
    );
    expect(uploadWriteErrorMessage({ code: "23503", message: 'violates "threads_activity_id_fkey"' })).toBe(
      "Students have asked questions on this activity, so it cannot be deleted.",
    );
    expect(uploadWriteErrorMessage({ code: "42501", message: "row-level security" })).toBe(uploadMessages.refused);
    expect(uploadWriteErrorMessage({ code: "XX000", message: "secret detail" })).toBe(uploadMessages.failed);
    expect(uploadWriteErrorMessage(null)).toBe(uploadMessages.gone);
  });

  it("ties settings refusals to their field", () => {
    expect(uploadSettingsErrorState(raised("activity_has_grades"))).toEqual({
      tone: "alert",
      message: uploadMessages.checkFields,
      fieldErrors: { points: "Points cannot change after work has been graded." },
    });
    expect(uploadSettingsErrorState(raised("activity_points_range")).fieldErrors).toEqual({
      points: "Enter points from 1 to 1,000.",
    });
    expect(uploadSettingsErrorState(raised("activity_lesson_outside_class")).fieldErrors).toEqual({
      lessonId: "That lesson is not in this class.",
    });
    expect(uploadSettingsErrorState(raised("something_else"))).toEqual({
      tone: "alert",
      message: uploadMessages.rejected,
    });
    expect(uploadSettingsErrorState(null)).toEqual({ tone: "alert", message: uploadMessages.gone });
  });
});

describe("removing graded files", () => {
  it("says how many were removed", () => {
    expect(removedFilesMessage(12)).toBe("Removed the files of 12 graded submissions. Scores and feedback are kept.");
    expect(removedFilesMessage(1)).toBe("Removed the files of 1 graded submission. Scores and feedback are kept.");
    expect(removedFilesMessage(0)).toBe("No graded files to remove.");
  });
});
