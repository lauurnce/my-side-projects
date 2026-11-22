import type { Status } from "@/components/ui/StatusChip";
import { activityState, bestAttempt, type Activity, type ActivityState, type Attempt } from "@/lib/quiz";

export type OpsData = { activities: Activity[]; attempts: Attempt[]; now: number };

export type OpsItem = { activity: Activity; state: ActivityState; best: Attempt | null };

export type OpsChip = { status: Status; text: string };

export const hubOpsLimit = 5;

const stateOrder: Record<ActivityState, number> = { in_progress: 0, open: 1, done: 2, closed: 3, draft: 4 };

const shortManila = new Intl.DateTimeFormat("en-US", {
  timeZone: "Asia/Manila",
  hourCycle: "h12",
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

export function opsHref(activityId: string): string {
  return `/ops/${activityId}`;
}

export function formatManilaShort(value: string | null | undefined): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return shortManila.format(date).replace(/\s/g, " ");
}

export function opsItems({ activities, attempts, now }: OpsData): OpsItem[] {
  const grouped = new Map<string, Attempt[]>();
  for (const attempt of attempts) {
    grouped.set(attempt.activityId, [...(grouped.get(attempt.activityId) ?? []), attempt]);
  }
  return activities
    .filter((activity) => activity.publishedAt !== null)
    .map((activity) => {
      const own = grouped.get(activity.id) ?? [];
      return { activity, state: activityState(activity, own, now), best: bestAttempt(own) };
    });
}

export function chipFor({ activity, state, best }: OpsItem): OpsChip {
  if (state === "in_progress") return { status: "submitted", text: "In progress" };
  if (state === "done") {
    return { status: "graded", text: best ? `Graded · ${best.score ?? 0} of ${best.maxScore}` : "Graded" };
  }
  if (state === "closed") return { status: "due", text: "Closed" };
  if (state === "draft") return { status: "due", text: "Draft" };
  const due = formatManilaShort(activity.dueAt);
  return { status: "due", text: due ? `Due ${due}` : "No due date" };
}

export function detailLine(activity: Pick<Activity, "points" | "timeLimitMin">): string {
  const points = activity.points === 1 ? "1 point" : `${activity.points} points`;
  if (activity.timeLimitMin === null) return `${points} · no time limit`;
  return `${points} · ${activity.timeLimitMin === 1 ? "1 minute" : `${activity.timeLimitMin} minutes`}`;
}

export function kindLine(classCode: string): string {
  return `Quiz · ${classCode}`;
}

function dueTime(activity: Activity): number {
  const time = activity.dueAt === null ? Number.NaN : new Date(activity.dueAt).getTime();
  return Number.isNaN(time) ? Number.POSITIVE_INFINITY : time;
}

export function hubOrder(items: OpsItem[]): OpsItem[] {
  return items
    .map((item, index) => ({ item, index }))
    .sort((first, second) => {
      const byState = stateOrder[first.item.state] - stateOrder[second.item.state];
      if (byState !== 0) return byState;
      if (first.item.state !== "open") return first.index - second.index;
      const firstDue = dueTime(first.item.activity);
      const secondDue = dueTime(second.item.activity);
      if (firstDue === secondDue) return first.index - second.index;
      return firstDue < secondDue ? -1 : 1;
    })
    .map(({ item }) => item);
}

export function dueCount(items: OpsItem[]): number {
  return items.filter((item) => item.state === "open" || item.state === "in_progress").length;
}

export function dueCountLabel(count: number): string {
  return `${count} due`;
}

export function activityCountLabel(count: number): string {
  return count === 1 ? "1 activity" : `${count} activities`;
}

export function nextDue(items: OpsItem[]): OpsItem | null {
  const dated = items.filter((item) => item.state === "open" && Number.isFinite(dueTime(item.activity)));
  return hubOrder(dated)[0] ?? null;
}

export function nextDueText(item: OpsItem): string {
  return `Next due: ${item.activity.title}, ${formatManilaShort(item.activity.dueAt)}`;
}
