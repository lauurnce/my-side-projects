import { z } from "zod";
import { quizLimits } from "@/lib/config";
import { isoToManilaInput, manilaInputToIso } from "@/lib/manila-time";
import type { Activity, KeyValue, QuestionKind, TeacherQuestion } from "@/lib/quiz";

export const quizMessages = {
  failed: "Something went wrong. Try again.",
  gone: "That quiz is no longer here. Reload the page.",
  questionGone: "That question is no longer here. Reload the page.",
  refused: "You cannot change this quiz.",
  checkFields: "Check the marked fields, then save again.",
  rejected: "That was not accepted. Check the text and remove hidden characters.",
  settingsSaved: "Settings saved",
  badDate: "Enter a real date and time",
  afterSubmitSingleAttempt: "Showing answers right after submitting needs exactly one attempt.",
  afterDueNeedsDue: "Showing answers after the due date needs a due date.",
  timeLimitLocked: "The time limit cannot change after a student has started.",
  deckOutsideClass: "That deck is not ready or is not in this class.",
  lessonOutsideClass: "That lesson is not in this class.",
  locked: "This quiz is published. Unpublish it to change questions.",
  badOptions: `Use ${quizLimits.optionsMin} to ${quizLimits.optionsMax} different options.`,
  badKeyMcq: "Choose which option is correct. It must be an option you filled in.",
  badKeyTf: "Choose True or False as the right answer.",
  badKeyIdent: `Enter 1 to ${quizLimits.acceptedAnswersMax} different accepted answers, one per line, ${quizLimits.answerLength} characters each at most.`,
  questionLimit: `A quiz can have ${quizLimits.questionsPerQuiz} questions at most.`,
  badQuestion: `Check the question text and the points. Points go from 1 to ${quizLimits.questionPointsMax}.`,
  questionSaved: "Question saved",
  questionDeleted: "Question deleted",
  moved: "Moved",
  notReady: "Add at least one question before publishing.",
  startedNoUnpublish: "Students have started this quiz, so it cannot be unpublished. Close it instead.",
  startedNoDelete: "Students have attempts on this quiz, so it cannot be deleted. Close it instead.",
  published: "Quiz published. Students can take it now.",
  unpublished: "Quiz unpublished. Students no longer see it.",
  closed: "Quiz closed. No more answers are accepted.",
  notOpen: "This quiz is not open, so there is nothing to close.",
} as const;

export type QuizActionState = {
  tone?: "status" | "alert";
  message?: string;
};

export const settingsFields = [
  "title",
  "instructions",
  "dueAt",
  "attemptLimit",
  "timeLimit",
  "showAnswers",
  "deckId",
  "lessonId",
] as const;

export type SettingsField = (typeof settingsFields)[number];

export type SettingsValues = Record<SettingsField, string>;

export type SaveSettingsState = QuizActionState & {
  fieldErrors?: Partial<Record<SettingsField, string>>;
  values?: SettingsValues;
};

export type QuestionField = "prompt" | "points";

export type QuestionValues = {
  kind: string;
  prompt: string;
  points: string;
  options: string[];
  correctOption: string;
  truth: string;
  accepted: string;
};

export type KeyFormValues = Pick<QuestionValues, "correctOption" | "truth" | "accepted">;

export type SaveQuestionState = QuizActionState & {
  fieldErrors?: Partial<Record<QuestionField, string>>;
  values?: QuestionValues;
};

export type QuestionArguments = {
  question_kind: QuestionKind;
  question_prompt: string;
  question_options: string[] | null;
  question_points: number;
  key_answers: KeyValue;
};

export type BuiltQuestion =
  | { ok: true; args: QuestionArguments }
  | { ok: false; message: string; fieldErrors?: Partial<Record<QuestionField, string>> };

export const builderIntents = [
  "createQuiz",
  "deleteQuestion",
  "moveQuestion",
  "setQuizPublished",
  "closeQuizNow",
  "deleteQuiz",
] as const;

export type BuilderIntent = (typeof builderIntents)[number];

export const builderIntentSchema = z.enum(builderIntents);

const hiddenTitleCharacters = /[\u0000-\u001F\u007F​-‏‪-‮⁦-⁩﻿]/;
const hiddenBodyCharacters = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F‪-‮⁦-⁩﻿]/;
const hiddenMessage = "Remove hidden or control characters";
const lineBreak = /\r\n?/g;

function wholeNumberBetween(value: string, min: number, max: number): boolean {
  return /^\d{1,4}$/.test(value) && Number(value) >= min && Number(value) <= max;
}

function textOf(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

function normalized(text: string): string {
  return text.normalize("NFKC").replace(/\s+/g, " ").trim().toLowerCase();
}

function allDifferent(texts: string[]): boolean {
  return new Set(texts.map(normalized)).size === texts.length;
}

export const quizTitleSchema = z
  .string("Enter a quiz title")
  .trim()
  .min(1, "Enter a quiz title")
  .max(quizLimits.titleLength, `Use ${quizLimits.titleLength} characters or fewer`)
  .refine((value) => !hiddenTitleCharacters.test(value), hiddenMessage);

const instructionsSchema = z
  .string()
  .transform((value) => value.replace(lineBreak, "\n"))
  .refine(
    (value) => value.length <= quizLimits.instructionsLength,
    `Use ${quizLimits.instructionsLength.toLocaleString("en-US")} characters or fewer`,
  )
  .refine((value) => !hiddenBodyCharacters.test(value), hiddenMessage);

const dueAtSchema = z
  .string()
  .trim()
  .refine((value) => value === "" || manilaInputToIso(value) !== null, quizMessages.badDate)
  .transform((value) => (value === "" ? null : manilaInputToIso(value)));

const attemptLimitSchema = z
  .string()
  .trim()
  .refine(
    (value) => wholeNumberBetween(value, 1, quizLimits.attemptLimitMax),
    `Enter a whole number from 1 to ${quizLimits.attemptLimitMax}`,
  )
  .transform(Number);

const timeLimitSchema = z
  .string()
  .trim()
  .refine(
    (value) => value === "" || wholeNumberBetween(value, 1, quizLimits.timeLimitMaxMinutes),
    `Enter 1 to ${quizLimits.timeLimitMaxMinutes} minutes, or leave it empty`,
  )
  .transform((value) => (value === "" ? null : Number(value)));

const optionalIdSchema = z
  .string()
  .refine((value) => value === "" || z.uuid().safeParse(value).success, "Choose one from the list")
  .transform((value) => (value === "" ? null : value));

export const quizSettingsSchema = z
  .object({
    title: quizTitleSchema,
    instructions: instructionsSchema,
    dueAt: dueAtSchema,
    attemptLimit: attemptLimitSchema,
    timeLimit: timeLimitSchema,
    showAnswers: z.enum(["after_submit", "after_due", "never"], "Choose when to show answers"),
    deckId: optionalIdSchema,
    lessonId: optionalIdSchema,
  })
  .refine((settings) => settings.showAnswers !== "after_submit" || settings.attemptLimit === 1, {
    path: ["showAnswers"],
    message: quizMessages.afterSubmitSingleAttempt,
  })
  .refine((settings) => settings.showAnswers !== "after_due" || settings.dueAt !== null, {
    path: ["showAnswers"],
    message: quizMessages.afterDueNeedsDue,
  });

export const createQuizSchema = z.object({ classId: z.uuid(), title: quizTitleSchema });

export const activityTargetSchema = z.object({ activityId: z.uuid() });

export const questionTargetSchema = z.object({ questionId: z.uuid() });

const kindSchema = z.enum(["mcq", "tf", "ident"]);

const stepByDirection = { up: -1, down: 1 } as const;

export const moveQuestionSchema = z.object({
  questionId: z.uuid(),
  step: z.enum(["up", "down"]).transform((direction) => stepByDirection[direction]),
});

export const setQuizPublishedSchema = z.object({
  activityId: z.uuid(),
  published: z.enum(["true", "false"]).transform((value) => value === "true"),
});

export const saveQuestionTargetSchema = z.object({
  activityId: z.uuid(),
  questionId: z.union([z.literal("").transform(() => null), z.uuid()]),
});

export const rekeyTargetSchema = z.object({ questionId: z.uuid(), kind: kindSchema });

const questionBaseSchema = z.object({
  kind: kindSchema,
  prompt: z
    .string()
    .transform((value) => value.replace(lineBreak, "\n").trim())
    .refine((value) => value.length > 0, "Enter the question")
    .refine(
      (value) => value.length <= quizLimits.promptLength,
      `Use ${quizLimits.promptLength.toLocaleString("en-US")} characters or fewer`,
    )
    .refine((value) => !hiddenBodyCharacters.test(value), hiddenMessage),
  points: z
    .string()
    .trim()
    .refine(
      (value) => wholeNumberBetween(value, 1, quizLimits.questionPointsMax),
      `Enter a whole number from 1 to ${quizLimits.questionPointsMax}`,
    )
    .transform(Number),
});

export function settingsValues(activity: Activity): SettingsValues {
  return {
    title: activity.title,
    instructions: activity.instructionsMd,
    dueAt: isoToManilaInput(activity.dueAt),
    attemptLimit: String(activity.attemptLimit),
    timeLimit: activity.timeLimitMin === null ? "" : String(activity.timeLimitMin),
    showAnswers: activity.showAnswers,
    deckId: activity.requiresDeckId ?? "",
    lessonId: activity.lessonId ?? "",
  };
}

export function settingsFromForm(formData: FormData): SettingsValues {
  return {
    title: textOf(formData, "title"),
    instructions: textOf(formData, "instructions").replace(lineBreak, "\n"),
    dueAt: textOf(formData, "dueAt"),
    attemptLimit: textOf(formData, "attemptLimit"),
    timeLimit: textOf(formData, "timeLimit"),
    showAnswers: textOf(formData, "showAnswers"),
    deckId: textOf(formData, "deckId"),
    lessonId: textOf(formData, "lessonId"),
  };
}

export function settingsFieldErrors(error: z.ZodError): Partial<Record<SettingsField, string>> {
  const errors: Partial<Record<SettingsField, string>> = {};
  for (const issue of error.issues) {
    const field = settingsFields.find((name) => name === issue.path[0]);
    if (field && !errors[field]) errors[field] = issue.message;
  }
  return errors;
}

type WriteError = { code?: string; message?: string } | null;

function raised(error: WriteError, name: string): boolean {
  return error?.code === "23514" && (error.message ?? "").includes(name);
}

const settingsRefusals: [string, SettingsField, string][] = [
  ["activities_after_submit_single_attempt", "showAnswers", quizMessages.afterSubmitSingleAttempt],
  ["activities_after_due_needs_due", "showAnswers", quizMessages.afterDueNeedsDue],
  ["activity_has_attempts", "timeLimit", quizMessages.timeLimitLocked],
  ["activity_deck_outside_class", "deckId", quizMessages.deckOutsideClass],
  ["activity_lesson_outside_class", "lessonId", quizMessages.lessonOutsideClass],
];

export function settingsErrorState(error: WriteError): Pick<SaveSettingsState, "tone" | "message" | "fieldErrors"> {
  const refusal = settingsRefusals.find(([name]) => raised(error, name));
  if (refusal) return { tone: "alert", message: quizMessages.checkFields, fieldErrors: { [refusal[1]]: refusal[2] } };
  return { tone: "alert", message: quizWriteErrorMessage(error) };
}

export function quizWriteErrorMessage(error: WriteError): string {
  if (!error) return quizMessages.gone;
  if (raised(error, "activity_not_ready")) return quizMessages.notReady;
  if (raised(error, "activity_has_attempts")) return quizMessages.startedNoUnpublish;
  if (error.code === "23514") return quizMessages.rejected;
  if (error.code === "23503") return quizMessages.startedNoDelete;
  if (error.code === "42501") return quizMessages.refused;
  return quizMessages.failed;
}

export function titleErrorMessage(error: z.ZodError): string {
  const titleIssue = error.issues.find((issue) => issue.path[0] === "title");
  return titleIssue ? titleIssue.message : quizMessages.gone;
}

const optionRows = Array.from({ length: quizLimits.optionsMax }, (_, index) => index + 1);

export function keyFromForm(formData: FormData): KeyFormValues {
  return {
    correctOption: textOf(formData, "correctOption"),
    truth: textOf(formData, "truth"),
    accepted: textOf(formData, "accepted").replace(lineBreak, "\n"),
  };
}

export function questionFromForm(formData: FormData): QuestionValues {
  return {
    kind: textOf(formData, "kind"),
    prompt: textOf(formData, "prompt").replace(lineBreak, "\n"),
    points: textOf(formData, "points"),
    options: optionRows.map((row) => textOf(formData, `option${row}`)),
    ...keyFromForm(formData),
  };
}

export function questionValues(question: TeacherQuestion | null): QuestionValues {
  const options = question?.options ?? [];
  const key = question?.key ?? null;
  return {
    kind: question?.kind ?? "mcq",
    prompt: question?.prompt ?? "",
    points: String(question?.points ?? 1),
    options: optionRows.map((row) => options[row - 1] ?? ""),
    correctOption: typeof key === "number" ? String(key + 1) : "",
    truth: typeof key === "boolean" ? String(key) : "",
    accepted: Array.isArray(key) ? key.join("\n") : "",
  };
}

export function acceptedAnswers(text: string): string[] {
  return text
    .split(/\r\n?|\n/)
    .map((line) => line.trim())
    .filter((line) => line !== "");
}

function truthKey(truth: string): boolean | null {
  if (truth === "true") return true;
  return truth === "false" ? false : null;
}

function acceptedKey(text: string): string[] | null {
  const answers = acceptedAnswers(text);
  if (answers.length < 1 || answers.length > quizLimits.acceptedAnswersMax) return null;
  if (answers.some((answer) => answer.length > quizLimits.answerLength)) return null;
  return allDifferent(answers) ? answers : null;
}

function chosenRow(correctOption: string): number | null {
  return wholeNumberBetween(correctOption, 1, quizLimits.optionsMax) ? Number(correctOption) : null;
}

export function badKeyMessage(kind: QuestionKind): string {
  if (kind === "mcq") return quizMessages.badKeyMcq;
  return kind === "tf" ? quizMessages.badKeyTf : quizMessages.badKeyIdent;
}

export function rekeyValue(kind: QuestionKind, values: KeyFormValues): KeyValue | null {
  if (kind === "tf") return truthKey(values.truth);
  if (kind === "ident") return acceptedKey(values.accepted);
  const row = chosenRow(values.correctOption);
  return row === null ? null : row - 1;
}

type FilledOption = { row: number; text: string };

function filledOptions(options: string[]): FilledOption[] {
  return options
    .slice(0, quizLimits.optionsMax)
    .map((text, index) => ({ row: index + 1, text: text.trim() }))
    .filter((option) => option.text !== "");
}

function optionsAccepted(options: FilledOption[]): boolean {
  if (options.length < quizLimits.optionsMin) return false;
  if (options.some((option) => option.text.length > quizLimits.optionLength)) return false;
  return allDifferent(options.map((option) => option.text));
}

function questionFieldErrors(error: z.ZodError): Partial<Record<QuestionField, string>> {
  const errors: Partial<Record<QuestionField, string>> = {};
  for (const issue of error.issues) {
    const field = issue.path[0];
    if ((field === "prompt" || field === "points") && !errors[field]) errors[field] = issue.message;
  }
  return errors;
}

export function buildQuestion(values: QuestionValues): BuiltQuestion {
  const base = questionBaseSchema.safeParse(values);
  if (!base.success) {
    const fieldErrors = questionFieldErrors(base.error);
    const knownField = Object.keys(fieldErrors).length > 0;
    return { ok: false, message: knownField ? quizMessages.checkFields : quizMessages.failed, fieldErrors };
  }

  const { kind, prompt, points } = base.data;
  const shared = { question_kind: kind, question_prompt: prompt, question_points: points };
  if (kind !== "mcq") {
    const key = rekeyValue(kind, values);
    if (key === null) return { ok: false, message: badKeyMessage(kind) };
    return { ok: true, args: { ...shared, question_options: null, key_answers: key } };
  }

  const options = filledOptions(values.options);
  if (!optionsAccepted(options)) return { ok: false, message: quizMessages.badOptions };
  const correctIndex = options.findIndex((option) => option.row === chosenRow(values.correctOption));
  if (correctIndex < 0) return { ok: false, message: quizMessages.badKeyMcq };
  return {
    ok: true,
    args: { ...shared, question_options: options.map((option) => option.text), key_answers: correctIndex },
  };
}

export function statusOf(result: unknown): string {
  if (typeof result === "string") return result;
  if (typeof result !== "object" || result === null) return "unknown";
  const { status } = result as Record<string, unknown>;
  return typeof status === "string" ? status : "unknown";
}

const questionStatusMessages: Record<string, string> = {
  locked: quizMessages.locked,
  bad_options: quizMessages.badOptions,
  question_limit: quizMessages.questionLimit,
  bad_question: quizMessages.badQuestion,
  refused: quizMessages.refused,
  not_found: quizMessages.questionGone,
};

export function questionStatusMessage(status: string, kind: QuestionKind): string {
  if (status === "bad_key") return badKeyMessage(kind);
  return questionStatusMessages[status] ?? quizMessages.failed;
}

export function saveQuestionState(result: unknown, kind: QuestionKind): QuizActionState {
  const status = statusOf(result);
  if (status === "saved") return { tone: "status", message: quizMessages.questionSaved };
  return { tone: "alert", message: questionStatusMessage(status, kind) };
}

export function deleteQuestionState(result: unknown): QuizActionState {
  const status = statusOf(result);
  if (status === "deleted") return { tone: "status", message: quizMessages.questionDeleted };
  return { tone: "alert", message: questionStatusMessage(status, "mcq") };
}

export function moveQuestionState(result: unknown): QuizActionState {
  const status = statusOf(result);
  if (status === "moved") return { tone: "status", message: quizMessages.moved };
  if (status === "edge") return {};
  return { tone: "alert", message: questionStatusMessage(status, "mcq") };
}

export function regradedMessage(regraded: number): string {
  return `Key changed. ${regraded} ${regraded === 1 ? "attempt" : "attempts"} regraded.`;
}

export function rekeyState(result: unknown, kind: QuestionKind): QuizActionState {
  const status = statusOf(result);
  if (status !== "rekeyed") return { tone: "alert", message: questionStatusMessage(status, kind) };
  const { regraded } = result as Record<string, unknown>;
  return { tone: "status", message: regradedMessage(typeof regraded === "number" ? regraded : 0) };
}
