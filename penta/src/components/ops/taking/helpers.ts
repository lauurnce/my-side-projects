import { answerFieldPrefix, capAnswerText } from "@/app/ops/attempt-schema";
import type { Activity, AnswerValue, Attempt, KeyValue, PaperQuestion, QuestionKind } from "@/lib/quiz";
import { attemptsLeft, isPastDue, openAttempt } from "@/lib/quiz";
import type { SaveOutcome } from "./save-queue";

export type SaveReply = { outcome: SaveOutcome; expiresAt: string | null; now: string | null };
export type PrimaryAction = "start" | "continue" | "closed" | "no_attempts" | "locked" | "unavailable";
export type DeckGate =
  | { state: "none" }
  | { state: "unreadable" }
  | { state: "locked"; viewed: number; total: number; href: string };

const outcomes: readonly string[] = ["saved", "late", "submitted", "refused"];

export function pointsLabel(points: number): string {
  return points === 1 ? "1 point" : `${points} points`;
}

export function questionLegend(number: number, points: number): string {
  return `Question ${number} (${pointsLabel(points)})`;
}

export function optionLetter(index: number): string {
  return String.fromCharCode(65 + index);
}

export function answerText(question: Pick<PaperQuestion, "kind" | "options">, answer: AnswerValue): string | null {
  if (typeof answer === "boolean") return answer ? "True" : "False";
  if (typeof answer === "string") return answer === "" ? null : answer;
  if (typeof answer !== "number" || question.kind !== "mcq") return null;
  const option = question.options?.[answer];
  return option === undefined ? null : `${optionLetter(answer)}. ${option}`;
}

export function acceptedText(question: Pick<PaperQuestion, "kind" | "options">, accepted: KeyValue | undefined): string | null {
  if (accepted === undefined) return null;
  if (Array.isArray(accepted)) return accepted.join(", ");
  return answerText(question, accepted);
}

export function timeLimitText(minutes: number | null): string {
  if (minutes === null) return "No time limit";
  return minutes === 1 ? "Time limit: 1 minute" : `Time limit: ${minutes} minutes`;
}

export function primaryAction(activity: Activity, attempts: Attempt[], gate: DeckGate, now: number): PrimaryAction {
  if (activity.publishedAt === null) return "unavailable";
  if (openAttempt(attempts)) return "continue";
  if (isPastDue(activity, now)) return "closed";
  if (attemptsLeft(activity, attempts) === 0) return "no_attempts";
  return gate.state === "none" ? "start" : "locked";
}

export function fieldQuestionId(name: string): string | null {
  return name.startsWith(answerFieldPrefix) ? name.slice(answerFieldPrefix.length) : null;
}

export function fieldAnswer(kind: QuestionKind, value: string): AnswerValue {
  if (kind === "mcq") return Number(value);
  if (kind === "tf") return value === "true";
  return value.trim() === "" ? null : capAnswerText(value);
}

export function toSaveReply(value: unknown): SaveReply {
  const fields = typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
  const { status, expires_at, now } = fields;
  return {
    outcome: typeof status === "string" && outcomes.includes(status) ? (status as SaveOutcome) : "failed",
    expiresAt: typeof expires_at === "string" ? expires_at : null,
    now: typeof now === "string" ? now : null,
  };
}
