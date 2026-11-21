import { z } from "zod";

export const lessonDoneMessages = {
  markedDone: "Marked as done.",
  markedNotDone: "Marked as not done.",
  unavailable: "This lesson is no longer available.",
  failed: "Could not save your progress. Try again.",
};

export const lessonDoneSchema = z.object({
  lessonId: z.uuid(),
  done: z.enum(["true", "false"]).transform((value) => value === "true"),
});

export type LessonDoneState = {
  status: "idle" | "saved" | "error";
  message: string;
};

export type LessonDoneAction = (previousState: LessonDoneState, formData: FormData) => Promise<LessonDoneState>;

export const idleLessonDoneState: LessonDoneState = { status: "idle", message: "" };

const unavailableCodes = ["42501", "23503"];

export function progressErrorMessage(code: string | null | undefined): string {
  return code && unavailableCodes.includes(code) ? lessonDoneMessages.unavailable : lessonDoneMessages.failed;
}

export function lessonDoneError(message: string): LessonDoneState {
  return { status: "error", message };
}

export function lessonDoneSaved(done: boolean): LessonDoneState {
  return { status: "saved", message: done ? lessonDoneMessages.markedDone : lessonDoneMessages.markedNotDone };
}
