import type { GradeState, OwnGradeCell } from "@/lib/grades";
import type { Activity } from "@/lib/quiz";

export type DeadlineItem = {
  id: string;
  title: string;
  kind: "Quiz" | "Upload";
  classCode: string;
  dueAt: string | null;
  state: GradeState;
};

export type DeadlineGroups = { upcoming: DeadlineItem[]; undated: DeadlineItem[]; pastDue: DeadlineItem[] };

export type ShownDeadlines = DeadlineGroups & { more: number; morePastDue: number };

export const deadlineLimit = 10;
export const pastDueLimit = 5;

type DeadlineActivity = Pick<Activity, "id" | "classId" | "type" | "title" | "dueAt" | "publishedAt">;
type DeadlineCell = Pick<OwnGradeCell, "activityId" | "state">;
type DeadlineClass = { id: string; code: string };

function dueTime(item: DeadlineItem): number | null {
  if (item.dueAt === null) return null;
  const time = new Date(item.dueAt).getTime();
  return Number.isNaN(time) ? null : time;
}

function soonestFirst(first: DeadlineItem, second: DeadlineItem): number {
  return (dueTime(first) ?? 0) - (dueTime(second) ?? 0) || first.title.localeCompare(second.title, "en");
}

export function pickDeadlines(
  activities: DeadlineActivity[],
  cells: DeadlineCell[],
  classes: DeadlineClass[],
  now: number,
): DeadlineGroups {
  const codes = new Map(classes.map((item) => [item.id, item.code]));
  const states = new Map(cells.map((cell) => [cell.activityId, cell.state]));
  const items = activities
    .filter((activity) => activity.publishedAt !== null && codes.has(activity.classId))
    .map((activity): DeadlineItem => ({
      id: activity.id,
      title: activity.title,
      kind: activity.type === "upload" ? "Upload" : "Quiz",
      classCode: codes.get(activity.classId) ?? "",
      dueAt: activity.dueAt,
      state: states.get(activity.id) ?? "none",
    }));
  const open = items.filter((item) => item.state === "none" || item.state === "in_progress");

  return {
    upcoming: open.filter((item) => (dueTime(item) ?? 0) > now).sort(soonestFirst),
    undated: open.filter((item) => dueTime(item) === null),
    pastDue: items
      .filter((item) => item.state === "missing")
      .sort(soonestFirst)
      .reverse(),
  };
}

export function shownDeadlines(groups: DeadlineGroups): ShownDeadlines {
  const upcoming = groups.upcoming.slice(0, deadlineLimit);
  const undated = groups.undated.slice(0, deadlineLimit - upcoming.length);
  const pastDue = groups.pastDue.slice(0, pastDueLimit);
  return {
    upcoming,
    undated,
    pastDue,
    more: groups.upcoming.length + groups.undated.length - upcoming.length - undated.length,
    morePastDue: groups.pastDue.length - pastDue.length,
  };
}

export function moreLabel(count: number): string {
  return `and ${count} more`;
}
