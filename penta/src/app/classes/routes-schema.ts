import { z } from "zod";
import { lessonBodySchema, lessonMinutesSchema, lessonTitleSchema, moduleTitleSchema } from "@/lib/lesson-rules";

export const routeMessages = {
  failed: "Something went wrong. Try again.",
  gone: "That item is no longer here. Reload the page.",
  refused: "You cannot change this class.",
  rejectedText: "That text was not accepted. Check its length and remove hidden characters.",
  moduleLimit: "A class can have 30 modules at most.",
  lessonLimit: "A module can have 60 lessons at most.",
  moduleHasLessons: "Delete or unpublish its lessons first. A module with lessons cannot be deleted.",
  lessonHasProgress: "Students have completed this lesson, so it cannot be deleted. Unpublish it instead.",
  lessonHasDeck: "A deck is linked to this lesson. Unlink or delete the deck first.",
  lessonHasQuestions: "Students have asked questions on this lesson, so it cannot be deleted. Unpublish it instead.",
  saveConflict: "This lesson was changed in another tab, or it no longer exists. Copy your text, then reload.",
  checkFields: "Check the marked fields, then save again.",
  saved: "Saved",
  moduleAdded: "Module added",
  moduleRenamed: "Module renamed",
  moduleDeleted: "Module deleted",
  moved: "Moved",
  lessonPublished: "Lesson published. Students can read it now.",
  lessonUnpublished: "Lesson unpublished. Students no longer see it.",
  lessonDeleted: "Lesson deleted",
} as const;

export type OutlineState = {
  tone?: "status" | "alert";
  message?: string;
};

export type SaveLessonField = "title" | "minutes" | "body";

export type SaveLessonValues = Record<SaveLessonField, string>;

export type SaveLessonState = {
  tone?: "status" | "alert";
  message?: string;
  fieldErrors?: Partial<Record<SaveLessonField, string>>;
  values?: SaveLessonValues;
  revision?: number;
};

export const outlineIntents = [
  "addModule",
  "renameModule",
  "deleteModule",
  "moveModule",
  "addLesson",
  "moveLesson",
  "setLessonPublished",
  "deleteLesson",
] as const;

export type OutlineIntent = (typeof outlineIntents)[number];

export const outlineIntentSchema = z.enum(outlineIntents);

const stepByDirection = { up: -1, down: 1 } as const;

const directionSchema = z.enum(["up", "down"]).transform((direction) => stepByDirection[direction]);

const revisionSchema = z
  .string()
  .regex(/^\d{1,9}$/)
  .transform(Number);

export const addModuleSchema = z.object({ classId: z.uuid(), title: moduleTitleSchema });

export const renameModuleSchema = z.object({ moduleId: z.uuid(), title: moduleTitleSchema });

export const moduleTargetSchema = z.object({ moduleId: z.uuid() });

export const moveModuleSchema = z.object({ moduleId: z.uuid(), step: directionSchema });

export const addLessonSchema = z.object({ moduleId: z.uuid(), title: lessonTitleSchema });

export const lessonTargetSchema = z.object({ lessonId: z.uuid() });

export const moveLessonSchema = z.object({ lessonId: z.uuid(), step: directionSchema });

export const setLessonPublishedSchema = z.object({
  lessonId: z.uuid(),
  published: z.enum(["true", "false"]).transform((value) => value === "true"),
});

export const saveLessonTargetSchema = z.object({ lessonId: z.uuid(), revision: revisionSchema });

export const saveLessonContentSchema = z.object({
  title: lessonTitleSchema,
  minutes: lessonMinutesSchema,
  body: lessonBodySchema,
});

type WriteError = { code?: string; message?: string } | null;

export function writeErrorMessage(error: WriteError, restrictedMessage: string = routeMessages.failed): string {
  if (!error) return routeMessages.gone;
  if (error.code === "P0001" && error.message?.includes("module_limit")) return routeMessages.moduleLimit;
  if (error.code === "P0001" && error.message?.includes("lesson_limit")) return routeMessages.lessonLimit;
  if (error.code === "23503" && error.message?.includes("decks_lesson_id_fkey")) return routeMessages.lessonHasDeck;
  if (error.code === "23503" && error.message?.includes("threads_lesson_id_fkey")) return routeMessages.lessonHasQuestions;
  if (error.code === "23503") return restrictedMessage;
  if (error.code === "23514") return routeMessages.rejectedText;
  if (error.code === "42501") return routeMessages.refused;
  return routeMessages.failed;
}

export function moveResultState(result: unknown): OutlineState {
  if (result === "moved") return { tone: "status", message: routeMessages.moved };
  if (result === "edge") return {};
  if (result === "not_found") return { tone: "alert", message: routeMessages.gone };
  return { tone: "alert", message: routeMessages.failed };
}

export function titleErrorMessage(error: z.ZodError): string {
  const titleIssue = error.issues.find((issue) => issue.path[0] === "title");
  return titleIssue ? titleIssue.message : routeMessages.gone;
}

export function saveFieldErrors(error: z.ZodError): Partial<Record<SaveLessonField, string>> {
  const errors: Partial<Record<SaveLessonField, string>> = {};
  for (const issue of error.issues) {
    const field = issue.path[0];
    if ((field === "title" || field === "minutes" || field === "body") && !errors[field]) errors[field] = issue.message;
  }
  return errors;
}
