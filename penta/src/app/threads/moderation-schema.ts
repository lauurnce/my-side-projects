import { z } from "zod";
import { formatManilaDateTime } from "@/lib/manila-time";

export const moderationMessages = {
  hidden: "Hidden from students",
  shown: "Shown to students again",
  postNotFound: "That post is not available.",
  locked: "Thread locked. Nobody can post or edit.",
  unlocked: "Thread unlocked.",
  threadNotFound: "That thread is not available.",
  failed: "Something went wrong. Try again.",
} as const;

export type ModerationState = {
  tone?: "status" | "alert";
  message?: string;
};

export type HistoryKind = "edit" | "hide" | "unhide";

export type HistoryEvent = {
  kind: HistoryKind;
  oldBody: string;
  actorName: string;
  happenedAt: string;
};

export type HistoryRow = {
  kind: string;
  old_body: string | null;
  actor_name: string | null;
  happened_at: string | null;
};

export const deletedAccountName = "Deleted account";

const flagSchema = z.enum(["true", "false"]).transform((value) => value === "true");

export const postIdSchema = z.uuid();

export const setPostHiddenSchema = z.object({
  postId: z.uuid(),
  hide: flagSchema,
  threadId: z.uuid().nullable().catch(null),
});

export const setThreadLockedSchema = z.object({ threadId: z.uuid(), lock: flagSchema });

const resultStatusSchema = z.object({ status: z.string() });

function statusOf(result: unknown): string {
  const parsed = resultStatusSchema.safeParse(result);
  return parsed.success ? parsed.data.status : "";
}

function status(message: string): ModerationState {
  return { tone: "status", message };
}

function alert(message: string): ModerationState {
  return { tone: "alert", message };
}

export function failedState(): ModerationState {
  return alert(moderationMessages.failed);
}

export function postHiddenState(result: unknown): ModerationState {
  const answer = statusOf(result);
  if (answer === "hidden") return status(moderationMessages.hidden);
  if (answer === "shown") return status(moderationMessages.shown);
  if (answer === "not_found") return alert(moderationMessages.postNotFound);
  return failedState();
}

export function threadLockedState(result: unknown): ModerationState {
  const answer = statusOf(result);
  if (answer === "locked") return status(moderationMessages.locked);
  if (answer === "unlocked") return status(moderationMessages.unlocked);
  if (answer === "not_found") return alert(moderationMessages.threadNotFound);
  return failedState();
}

const historyKinds: readonly string[] = ["edit", "hide", "unhide"];

function isHistoryKind(kind: string): kind is HistoryKind {
  return historyKinds.includes(kind);
}

export function toHistoryEvents(rows: HistoryRow[]): HistoryEvent[] {
  return rows.flatMap((row) => {
    if (!isHistoryKind(row.kind)) return [];
    return [
      {
        kind: row.kind,
        oldBody: row.kind === "edit" ? (row.old_body ?? "") : "",
        actorName: row.actor_name?.trim() || deletedAccountName,
        happenedAt: formatManilaDateTime(row.happened_at) ?? "",
      },
    ];
  });
}
