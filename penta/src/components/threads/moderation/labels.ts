import type { HistoryKind } from "@/app/threads/moderation-schema";

export const moderationCopy = {
  questionWarning: "Hiding the question hides the whole thread from students.",
  confirmHide: "Hide the thread",
  cancel: "Cancel",
  history: "History",
  historyLoading: "Loading the history.",
  historyEmpty: "No changes are recorded for this post.",
  historyFailed: "The history could not be loaded. Close it, then open it again.",
  earlierText: "Earlier text:",
  lockHelp: "A locked thread stays readable. Nobody can post or edit until you unlock it.",
  hideHelp: "You can hide any post. Hidden posts are not sent to students.",
} as const;

export function hideWord(hidden: boolean): string {
  return hidden ? "Unhide" : "Hide";
}

export function hideLabel(authorName: string, hidden: boolean): string {
  const name = authorName.trim();
  return name ? `${hideWord(hidden)} post by ${name}` : `${hideWord(hidden)} this post`;
}

export function historyLabel(authorName: string): string {
  const name = authorName.trim();
  return name ? `History of post by ${name}` : "History of this post";
}

export function lockWord(locked: boolean): string {
  return locked ? "Unlock thread" : "Lock thread";
}

export function editCountLabel(editCount: number): string {
  if (editCount <= 0) return "";
  return editCount === 1 ? "Edited 1 time" : `Edited ${editCount} times`;
}

const historyLeads: Record<HistoryKind, string> = {
  edit: "Edited by",
  hide: "Hidden by",
  unhide: "Shown again by",
};

export function historyLead(kind: HistoryKind): string {
  return historyLeads[kind];
}
