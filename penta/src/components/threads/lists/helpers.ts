import type { ThreadSummary } from "@/lib/threads";

export const classThreadsShown = 20;

function counted(count: number, one: string, many: string): string {
  return `${count.toLocaleString("en-US")} ${count === 1 ? one : many}`;
}

export function replyCountLabel(replies: number): string {
  return replies < 1 ? "No replies yet" : counted(replies, "reply", "replies");
}

export function questionCountLabel(count: number): string {
  return counted(count, "question", "questions");
}

export function hiddenCountLabel(hiddenPosts: number): string | null {
  return hiddenPosts < 1 ? null : `${hiddenPosts.toLocaleString("en-US")} hidden`;
}

export function moreLabel(total: number): string | null {
  return total > classThreadsShown ? `and ${(total - classThreadsShown).toLocaleString("en-US")} more` : null;
}

function lastActivity(thread: ThreadSummary): number {
  return Date.parse(thread.lastPostAt ?? thread.createdAt) || 0;
}

export function newestFirst(threads: ThreadSummary[]): ThreadSummary[] {
  return [...threads].sort((first, second) => lastActivity(second) - lastActivity(first));
}
