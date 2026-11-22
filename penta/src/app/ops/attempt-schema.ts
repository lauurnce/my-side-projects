import { z } from "zod";
import { quizLimits } from "@/lib/config";

export type StartState = { message?: string };
export type StartAction = (previousState: StartState, formData: FormData) => Promise<StartState>;
export type SubmitAction = (formData: FormData) => Promise<void>;
export type SentAnswer = number | boolean | string;
export type SentAnswers = Record<string, SentAnswer>;

export const answerFieldPrefix = "answer.";
export const kindFieldPrefix = "kind.";

export const startSchema = z.object({ activityId: z.uuid() });
export const submitSchema = z.object({ activityId: z.uuid(), attemptId: z.uuid() });

export const startMessages = {
  closed: "This quiz is closed. The due time has passed.",
  limit: "You have no attempts left.",
  locked: "Finish the required deck first.",
  not_found: "This quiz is not available.",
} as const;

const questionIdSchema = z.uuid();
const optionIndexShape = /^\d{1,2}$/;

export function startMessage(status: unknown): string {
  if (status === "closed" || status === "limit" || status === "locked") return startMessages[status];
  return startMessages.not_found;
}

export function startedAttemptId(reply: unknown): string | null {
  const parsed = z
    .object({ status: z.enum(["started", "resumed"]), attempt_id: z.uuid() })
    .safeParse(reply);
  return parsed.success ? parsed.data.attempt_id : null;
}

export function replyStatus(reply: unknown): unknown {
  return typeof reply === "object" && reply !== null && "status" in reply ? reply.status : null;
}

export function capAnswerText(text: string): string {
  return Array.from(text).slice(0, quizLimits.answerLength).join("");
}

export function toSentAnswer(kind: unknown, value: unknown): SentAnswer | null {
  if (typeof value !== "string") return null;
  if (kind === "ident" && value.trim() === "") return "";
  if (value.trim() === "") return null;
  if (kind === "mcq") return optionIndexShape.test(value) ? Number(value) : null;
  if (kind === "tf") return value === "true" || value === "false" ? value === "true" : null;
  if (kind === "ident") return capAnswerText(value);
  return null;
}

export function buildAnswers(entries: Iterable<[string, unknown]>): SentAnswers {
  const fields = new Map(entries);
  const answers: SentAnswers = {};
  for (const [name, value] of fields) {
    if (!name.startsWith(answerFieldPrefix)) continue;
    const questionId = name.slice(answerFieldPrefix.length);
    if (!questionIdSchema.safeParse(questionId).success) continue;
    const answer = toSentAnswer(fields.get(`${kindFieldPrefix}${questionId}`), value);
    if (answer !== null) answers[questionId] = answer;
  }
  return answers;
}
