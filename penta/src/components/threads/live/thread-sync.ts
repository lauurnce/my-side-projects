import { threadLimits } from "@/lib/config";
import type { OpenThread, ThreadView } from "@/lib/threads";

export type ThreadSync = { view: OpenThread | null; appliedRequest: number };

export type AnswerDecision = "apply" | "keep" | "gone";

export function decideAnswer(sync: ThreadSync, requestNo: number, answer: ThreadView | null): AnswerDecision {
  if (!answer || answer.status === "unchanged") return "keep";
  if (requestNo <= sync.appliedRequest) return "keep";
  if (answer.status === "not_found") return "gone";
  if (sync.view && answer.version < sync.view.version) return "keep";
  return "apply";
}

export function applyThreadAnswer(sync: ThreadSync, requestNo: number, answer: ThreadView | null): ThreadSync {
  const decision = decideAnswer(sync, requestNo, answer);
  if (decision === "gone") return { view: null, appliedRequest: requestNo };
  if (decision === "apply" && answer?.status === "ok") return { view: answer, appliedRequest: requestNo };
  return sync;
}

export function threadTopic(threadId: string): string {
  return `thread:${threadId}`;
}

export function threadPollDelay(input: { available: boolean; connected: boolean }, random: number): number {
  const fast = input.available && !input.connected;
  const base = fast ? threadLimits.pollDownMilliseconds : threadLimits.pollUpMilliseconds;
  return Math.round(base * (1 + (random * 2 - 1) * threadLimits.pollJitterRatio));
}

export function lookDelay(random: number): number {
  return Math.round(random * threadLimits.lookJitterMilliseconds);
}
