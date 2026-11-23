import { z } from "zod";
import { quizLimits, submissionLimits } from "@/lib/config";
import { isoToManilaInput, manilaInputToIso } from "@/lib/manila-time";
import type { Activity } from "@/lib/quiz";

const pointsMaxText = submissionLimits.pointsMax.toLocaleString("en-US");
const feedbackMaxText = submissionLimits.feedbackLength.toLocaleString("en-US");

export const uploadMessages = {
  failed: "Something went wrong. Try again.",
  gone: "That activity is no longer here. Reload the page.",
  refused: "You cannot change this activity.",
  checkFields: "Check the marked fields, then save again.",
  rejected: "That was not accepted. Check the text and remove hidden characters.",
  settingsSaved: "Settings saved",
  badDate: "Enter a real date and time",
  badPoints: `Enter points from 1 to ${pointsMaxText}.`,
  pointsLocked: "Points cannot change after work has been graded.",
  lessonOutsideClass: "That lesson is not in this class.",
  noUnpublish: "Students have handed in work, so this activity cannot be unpublished.",
  noDelete: "Students have handed in work, so this activity cannot be deleted.",
  published: "Activity published. Students can hand in work now.",
  unpublished: "Activity unpublished. Students no longer see it.",
  gradeSaved: "Grade saved",
  gradeChanged: "Grade changed",
  fileChanged: "The student replaced the file after you opened this page. Reload, open the new file, then grade.",
  badFeedback: `Feedback can be ${feedbackMaxText} characters at most.`,
  submissionGone: "That submission is no longer here.",
  noGradedFiles: "No graded files to remove.",
} as const;

export type UploadActionState = {
  tone?: "status" | "alert";
  message?: string;
};

export const uploadSettingsFields = ["title", "instructions", "points", "dueAt", "lessonId"] as const;

export type UploadSettingsField = (typeof uploadSettingsFields)[number];

export type UploadSettingsValues = Record<UploadSettingsField, string>;

export type SaveUploadSettingsState = UploadActionState & {
  fieldErrors?: Partial<Record<UploadSettingsField, string>>;
  values?: UploadSettingsValues;
};

export type GradeField = "score" | "feedback";

export type GradeValues = Record<GradeField, string>;

export type GradeState = UploadActionState & {
  field?: GradeField;
  values?: GradeValues;
};

export const uploadIntents = [
  "createUploadActivity",
  "setUploadPublished",
  "deleteUploadActivity",
  "removeGradedFiles",
] as const;

export type UploadIntent = (typeof uploadIntents)[number];

export const uploadIntentSchema = z.enum(uploadIntents);

const hiddenTitleCharacters = /[\u0000-\u001F\u007F​-‏‪-‮⁦-⁩﻿]/;
const hiddenBodyCharacters = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F‪-‮⁦-⁩﻿]/;
const hiddenMessage = "Remove hidden or control characters";
const lineBreak = /\r\n?/g;
const wholeNumber = /^\d{1,4}$/;

function textOf(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

function unixLines(text: string): string {
  return text.replace(lineBreak, "\n");
}

export function parseWholeNumber(text: string): number | null {
  const trimmed = text.trim();
  return wholeNumber.test(trimmed) ? Number(trimmed) : null;
}

export function parsePoints(text: string): number | null {
  const points = parseWholeNumber(text);
  return points !== null && points >= 1 && points <= submissionLimits.pointsMax ? points : null;
}

export const parseScore = parseWholeNumber;

export function badScoreMessage(points: number): string {
  return `Enter a whole number from 0 to ${points.toLocaleString("en-US")}.`;
}

const titleSchema = z
  .string("Enter an activity title")
  .trim()
  .min(1, "Enter an activity title")
  .max(quizLimits.titleLength, `Use ${quizLimits.titleLength} characters or fewer`)
  .refine((value) => !hiddenTitleCharacters.test(value), hiddenMessage);

const pointsSchema = z
  .string(uploadMessages.badPoints)
  .refine((value) => parsePoints(value) !== null, uploadMessages.badPoints)
  .transform(Number);

const instructionsSchema = z
  .string()
  .transform(unixLines)
  .refine(
    (value) => value.length <= quizLimits.instructionsLength,
    `Use ${quizLimits.instructionsLength.toLocaleString("en-US")} characters or fewer`,
  )
  .refine((value) => !hiddenBodyCharacters.test(value), hiddenMessage);

const dueAtSchema = z
  .string()
  .trim()
  .refine((value) => value === "" || manilaInputToIso(value) !== null, uploadMessages.badDate)
  .transform((value) => (value === "" ? null : manilaInputToIso(value)));

const optionalIdSchema = z
  .string()
  .refine((value) => value === "" || z.uuid().safeParse(value).success, "Choose one from the list")
  .transform((value) => (value === "" ? null : value));

export const createUploadSchema = z.object({ classId: z.uuid(), title: titleSchema, points: pointsSchema });

export const uploadSettingsSchema = z.object({
  title: titleSchema,
  instructions: instructionsSchema,
  points: pointsSchema,
  dueAt: dueAtSchema,
  lessonId: optionalIdSchema,
});

export const uploadTargetSchema = z.object({ activityId: z.uuid() });

export const setUploadPublishedSchema = z.object({
  activityId: z.uuid(),
  published: z.enum(["true", "false"]).transform((value) => value === "true"),
});

export const gradeTargetSchema = z.object({ submissionId: z.uuid(), expectedUpload: z.uuid() });

export function uploadSettingsValues(activity: Activity): UploadSettingsValues {
  return {
    title: activity.title,
    instructions: activity.instructionsMd,
    points: String(activity.points),
    dueAt: isoToManilaInput(activity.dueAt),
    lessonId: activity.lessonId ?? "",
  };
}

export function uploadSettingsFromForm(formData: FormData): UploadSettingsValues {
  return {
    title: textOf(formData, "title"),
    instructions: unixLines(textOf(formData, "instructions")),
    points: textOf(formData, "points"),
    dueAt: textOf(formData, "dueAt"),
    lessonId: textOf(formData, "lessonId"),
  };
}

export function gradeFromForm(formData: FormData): GradeValues {
  return { score: textOf(formData, "score"), feedback: unixLines(textOf(formData, "feedback")) };
}

export function feedbackFits(feedback: string): boolean {
  return feedback.trim().length <= submissionLimits.feedbackLength;
}

export function uploadSettingsFieldErrors(error: z.ZodError): Partial<Record<UploadSettingsField, string>> {
  const errors: Partial<Record<UploadSettingsField, string>> = {};
  for (const issue of error.issues) {
    const field = uploadSettingsFields.find((name) => name === issue.path[0]);
    if (field && !errors[field]) errors[field] = issue.message;
  }
  return errors;
}

export function createErrorMessage(error: z.ZodError): string {
  const issue = error.issues.find(({ path }) => path[0] === "title" || path[0] === "points");
  return issue ? issue.message : uploadMessages.gone;
}

type WriteError = { code?: string; message?: string } | null;

function raised(error: WriteError, name: string): boolean {
  return error?.code === "23514" && (error.message ?? "").includes(name);
}

const settingsRefusals: [string, UploadSettingsField, string][] = [
  ["activity_has_grades", "points", uploadMessages.pointsLocked],
  ["activity_points_range", "points", uploadMessages.badPoints],
  ["activity_lesson_outside_class", "lessonId", uploadMessages.lessonOutsideClass],
];

export function uploadWriteErrorMessage(error: WriteError): string {
  if (!error) return uploadMessages.gone;
  if (raised(error, "activity_has_attempts")) return uploadMessages.noUnpublish;
  const refusal = settingsRefusals.find(([name]) => raised(error, name));
  if (refusal) return refusal[2];
  if (error.code === "23514") return uploadMessages.rejected;
  if (error.code === "23503") return uploadMessages.noDelete;
  if (error.code === "42501") return uploadMessages.refused;
  return uploadMessages.failed;
}

export function uploadSettingsErrorState(
  error: WriteError,
): Pick<SaveUploadSettingsState, "tone" | "message" | "fieldErrors"> {
  const refusal = settingsRefusals.find(([name]) => raised(error, name));
  if (refusal) return { tone: "alert", message: uploadMessages.checkFields, fieldErrors: { [refusal[1]]: refusal[2] } };
  return { tone: "alert", message: uploadWriteErrorMessage(error) };
}

function fieldsOf(result: unknown): Record<string, unknown> {
  return typeof result === "object" && result !== null ? (result as Record<string, unknown>) : {};
}

export function gradeState(result: unknown, activityPoints: number): GradeState {
  const { status, regrade, points } = fieldsOf(result);
  if (status === "graded") {
    return { tone: "status", message: regrade === true ? uploadMessages.gradeChanged : uploadMessages.gradeSaved };
  }
  if (status === "changed") return { tone: "alert", message: uploadMessages.fileChanged };
  if (status === "bad_score") {
    const limit = typeof points === "number" ? points : activityPoints;
    return { tone: "alert", message: badScoreMessage(limit), field: "score" };
  }
  if (status === "bad_feedback") return { tone: "alert", message: uploadMessages.badFeedback, field: "feedback" };
  if (status === "refused") return { tone: "alert", message: uploadMessages.submissionGone };
  return { tone: "alert", message: uploadMessages.failed };
}

export function removedFilesMessage(count: number): string {
  if (count < 1) return uploadMessages.noGradedFiles;
  const noun = count === 1 ? "submission" : "submissions";
  return `Removed the files of ${count.toLocaleString("en-US")} graded ${noun}. Scores and feedback are kept.`;
}
