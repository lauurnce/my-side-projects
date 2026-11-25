import { z } from "zod";
import { deckLimits } from "@/lib/config";
import type { SaveAnswer } from "@/lib/slides/autosave";
import { deckTitleSchema } from "./upload-schema";

export const editorMessages = {
  failed: "Something went wrong. Try again.",
  badInput: "Check the title and try again.",
  refused: "You cannot add decks to this class.",
  badLesson: "That lesson is not in this class.",
  deckLimit: `A class can have ${deckLimits.decksPerClass} decks at most.`,
  full: "Storage is full. Delete decks you no longer need.",
  gone: "That deck is no longer here.",
  published: "Published. Students in this class can see this deck.",
} as const;

export type EditorActionState = { tone?: "status" | "alert"; message?: string };

export const createDeckSchema = z.object({
  classId: z.uuid(),
  title: deckTitleSchema,
  lessonId: z.union([z.literal("").transform(() => null), z.uuid()]),
});

export const saveDeckSchema = z.object({
  deckId: z.uuid(),
  knownVersion: z.number().int().min(1),
  saveId: z.uuid(),
  content: z.unknown(),
});

export const deckIdSchema = z.object({ deckId: z.uuid() });

const createRefusals: Record<string, string> = {
  refused: editorMessages.refused,
  bad_lesson: editorMessages.badLesson,
  deck_limit: editorMessages.deckLimit,
  full: editorMessages.full,
};

function fields(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
}

export function createdDeckId(value: unknown): string | null {
  const { status, deck_id: deckId } = fields(value);
  return status === "created" && typeof deckId === "string" && z.uuid().safeParse(deckId).success ? deckId : null;
}

export function createRefusedMessage(value: unknown): string {
  const { status } = fields(value);
  return (typeof status === "string" && createRefusals[status]) || editorMessages.failed;
}

export function toSaveAnswer(value: unknown): SaveAnswer {
  const { status, version, session_id: sessionId } = fields(value);
  if ((status === "saved" || status === "conflict") && typeof version === "number") return { status, version };
  if (status === "live" && typeof sessionId === "string") return { status, sessionId };
  if (status === "too_large" || status === "missing_image") return { status };
  if (status === "bad_content" || status === "not_found") return { status: "refused" };
  return { status: "failed" };
}
