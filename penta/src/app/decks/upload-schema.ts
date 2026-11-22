import { z } from "zod";
import { deckLimits } from "@/lib/config";
import { checkChosenFile, deckFileMessages } from "@/lib/deck-file";
import { formatBytes } from "@/lib/decks";
import type { Inspection, UploadTargets } from "@/lib/deck-storage";

export const deckMessages = {
  failed: "Something went wrong. Try again.",
  badInput: "Check the form and try again.",
  gone: "That deck is no longer here.",
  refused: "You cannot add decks to this class.",
  signedOut: "Your session ended. Log in again.",
  tooLarge: "These files are too large. Each file can be 50 MB at most.",
  badLesson: "That lesson is not in this class.",
  deckLimit: `A class can have ${deckLimits.decksPerClass} decks at most.`,
  pendingLimit: `You have ${deckLimits.unfinishedPerTeacher} unfinished uploads. Wait for them to finish or try again later.`,
  rejectedTitle: "That title was not accepted. Check its length and remove hidden characters.",
  storageUnavailable: "Storage is not available right now. Try again in a moment.",
  incomplete: "The upload did not finish. Try again.",
  largerThanDeclared: "The uploaded file is larger than the file you chose. Upload it again.",
  tooManyPages: `This PDF has too many pages. A deck can have ${deckLimits.slidesMax} at most.`,
  requiredByQuiz: "A quiz requires this deck. Remove the requirement first.",
  deleted: "Deck deleted",
  linkSaved: "Lesson link saved",
  linkRemoved: "Lesson link removed",
} as const;

export type DeckActionState = {
  tone?: "status" | "alert";
  message?: string;
};

export type UploadFailure = { status: "error"; message: string };

export type StartUploadResult = { status: "ok"; deckId: string; targets: UploadTargets } | UploadFailure;

export type UploadStepResult = { status: "ok" } | UploadFailure;

export type ReserveResult = { status: string; deckId: string | null; freeBytes: number };

export type FinishStep =
  | { step: "done" }
  | { step: "recheck" }
  | { step: "keep"; message: string }
  | { step: "remove"; message: string };

export const deckIntents = ["deleteDeck", "setDeckLesson"] as const;

export type DeckIntent = (typeof deckIntents)[number];

export const deckIntentSchema = z.enum(deckIntents);

const hiddenCharacters = /[\u0000-\u001F\u007F​-‏‪-‮⁦-⁩﻿]/;

export const deckTitleSchema = z
  .string("Enter a deck title")
  .trim()
  .min(1, "Enter a deck title")
  .max(deckLimits.titleLength, `Use ${deckLimits.titleLength} characters or fewer`)
  .refine((value) => !hiddenCharacters.test(value), "Remove hidden or control characters");

const chosenFileSchema = z.object({ name: z.string().max(255), size: z.number() });

export type ChosenFile = z.infer<typeof chosenFileSchema>;

export const startDeckUploadSchema = z.object({
  classId: z.uuid(),
  title: deckTitleSchema,
  lessonId: z.uuid().nullable(),
  pdf: chosenFileSchema,
  pptx: chosenFileSchema.nullable(),
});

export type StartDeckUploadInput = z.input<typeof startDeckUploadSchema>;

export const finishDeckUploadSchema = z.object({
  deckId: z.uuid(),
  slideCount: z.number().int().min(1).max(deckLimits.slidesMax),
});

export const deckTargetSchema = z.object({ deckId: z.uuid() });

export const setDeckLessonSchema = z.object({
  deckId: z.uuid(),
  lessonId: z.union([z.literal("").transform(() => null), z.uuid()]),
});

export function uploadFailure(message: string): UploadFailure {
  return { status: "error", message };
}

export function startInputMessage(error: z.ZodError): string {
  const titleIssue = error.issues.find((issue) => issue.path[0] === "title");
  return titleIssue ? titleIssue.message : deckMessages.badInput;
}

export function finishInputMessage(error: z.ZodError): string {
  const onlySlideCount = error.issues.every((issue) => issue.path[0] === "slideCount");
  return onlySlideCount ? deckMessages.tooManyPages : deckMessages.gone;
}

export function chosenFilesMessage(pdf: ChosenFile, pptx: ChosenFile | null): string | null {
  const pdfProblem = checkChosenFile("pdf", pdf);
  if (pdfProblem) return deckFileMessages[pdfProblem].pdf;
  const pptxProblem = pptx ? checkChosenFile("pptx", pptx) : null;
  return pptxProblem ? deckFileMessages[pptxProblem].pptx : null;
}

export function toReserveResult(value: unknown): ReserveResult {
  if (typeof value !== "object" || value === null) return { status: "unknown", deckId: null, freeBytes: 0 };
  const { status, deck_id, free_bytes } = value as Record<string, unknown>;
  return {
    status: typeof status === "string" ? status : "unknown",
    deckId: typeof deck_id === "string" ? deck_id : null,
    freeBytes: typeof free_bytes === "number" && free_bytes > 0 ? free_bytes : 0,
  };
}

export function notEnoughStorageMessage(declaredBytes: number, freeBytes: number): string {
  const free = freeBytes > 0 ? formatBytes(freeBytes) : "nothing";
  return `Not enough storage: this deck needs ${formatBytes(declaredBytes)} and ${free} is free. Delete a deck or upload a smaller file.`;
}

export function reserveMessage(result: ReserveResult, declaredBytes: number): string {
  if (result.status === "full") return notEnoughStorageMessage(declaredBytes, result.freeBytes);
  if (result.status === "pending_limit") return deckMessages.pendingLimit;
  if (result.status === "deck_limit") return deckMessages.deckLimit;
  if (result.status === "bad_lesson") return deckMessages.badLesson;
  if (result.status === "refused") return deckMessages.refused;
  if (result.status === "too_large") return deckMessages.tooLarge;
  if (result.status === "signed_out") return deckMessages.signedOut;
  return deckMessages.failed;
}

type WriteError = { code?: string } | null;

export function reserveErrorMessage(error: WriteError): string {
  return error?.code === "23514" ? deckMessages.rejectedTitle : deckMessages.failed;
}

export function deckDeleteErrorMessage(error: WriteError): string {
  return error?.code === "23503" ? deckMessages.requiredByQuiz : deckMessages.failed;
}

export function lessonLinkErrorMessage(error: WriteError): string {
  if (!error) return deckMessages.gone;
  if (error.code === "23514") return deckMessages.badLesson;
  if (error.code === "42501") return deckMessages.refused;
  return deckMessages.failed;
}

export function inspectionStep(inspection: Exclude<Inspection, { status: "ok" }>): FinishStep {
  if (inspection.status === "incomplete") return { step: "keep", message: deckMessages.incomplete };
  if (inspection.status === "unavailable") return { step: "keep", message: deckMessages.storageUnavailable };
  return { step: "remove", message: deckFileMessages[inspection.problem][inspection.kind] };
}

export function completionStep(status: unknown): FinishStep {
  if (status === "ready") return { step: "done" };
  if (status === "not_pending") return { step: "recheck" };
  if (status === "larger_than_declared") return { step: "remove", message: deckMessages.largerThanDeclared };
  if (status === "bad_slide_count") return { step: "remove", message: deckMessages.tooManyPages };
  return { step: "keep", message: deckMessages.failed };
}
