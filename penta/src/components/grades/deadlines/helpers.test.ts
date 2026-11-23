import { describe, expect, it } from "vitest";
import type { GradeState } from "@/lib/grades";
import { deadlineLimit, moreLabel, pastDueLimit, pickDeadlines, shownDeadlines } from "./helpers";

const now = Date.parse("2026-11-27T04:00:00.000Z");
const laterToday = "2026-11-27T15:59:00.000Z";
const tomorrow = "2026-11-28T15:59:00.000Z";
const nextWeek = "2026-12-04T15:59:00.000Z";
const yesterday = "2026-11-26T15:59:00.000Z";
const lastWeek = "2026-11-20T15:59:00.000Z";

const classes = [
  { id: "c1", code: "INTE 301" },
  { id: "c2", code: "COMP 015" },
];

function activity(id: string, dueAt: string | null, overrides: Record<string, unknown> = {}) {
  return {
    id,
    classId: "c1",
    type: "quiz" as const,
    title: `Activity ${id}`,
    dueAt,
    publishedAt: "2026-11-20T00:00:00.000Z" as string | null,
    ...overrides,
  };
}

const cell = (activityId: string, state: GradeState) => ({ activityId, state });
const ids = (items: { id: string }[]) => items.map((item) => item.id);

describe("pickDeadlines", () => {
  const activities = [
    activity("none", null),
    activity("next-week", nextWeek),
    activity("past", yesterday),
    activity("tomorrow", tomorrow, { type: "upload" as const, classId: "c2" }),
    activity("today", laterToday),
  ];
  const cells = [cell("past", "missing"), cell("today", "in_progress"), cell("tomorrow", "none")];
  const groups = pickDeadlines(activities, cells, classes, now);

  it("lists open work with a future due time, soonest first", () => {
    expect(ids(groups.upcoming)).toEqual(["today", "tomorrow", "next-week"]);
  });

  it("puts work with no due time in its own group", () => {
    expect(ids(groups.undated)).toEqual(["none"]);
  });

  it("puts missing work in the past due group and not among the upcoming", () => {
    expect(ids(groups.pastDue)).toEqual(["past"]);
    expect(ids([...groups.upcoming, ...groups.undated])).not.toContain("past");
  });

  it("carries the title, the kind, the class code, the due time and the state", () => {
    expect(groups.upcoming[1]).toEqual({
      id: "tomorrow",
      title: "Activity tomorrow",
      kind: "Upload",
      classCode: "COMP 015",
      dueAt: tomorrow,
      state: "none",
    });
    expect(groups.upcoming[0]).toMatchObject({ kind: "Quiz", classCode: "INTE 301", state: "in_progress" });
  });

  it("treats an activity with no cell as not started", () => {
    expect(ids(pickDeadlines([activity("a", tomorrow)], [], classes, now).upcoming)).toEqual(["a"]);
  });

  it("leaves out handed in and graded work", () => {
    const done = pickDeadlines(
      [activity("a", tomorrow), activity("b", null), activity("c", yesterday)],
      [cell("a", "submitted"), cell("b", "graded"), cell("c", "graded")],
      classes,
      now,
    );
    expect(done).toEqual({ upcoming: [], undated: [], pastDue: [] });
  });

  it("leaves out past due work that does not count as missing", () => {
    const joinedAfter = pickDeadlines([activity("a", yesterday)], [cell("a", "none")], classes, now);
    expect(joinedAfter).toEqual({ upcoming: [], undated: [], pastDue: [] });
  });

  it("leaves out drafts and activities of other classes", () => {
    const other = pickDeadlines(
      [activity("draft", tomorrow, { publishedAt: null }), activity("elsewhere", tomorrow, { classId: "c9" })],
      [],
      classes,
      now,
    );
    expect(other).toEqual({ upcoming: [], undated: [], pastDue: [] });
  });

  it("does not list work due exactly now as upcoming", () => {
    const atNow = pickDeadlines([activity("a", new Date(now).toISOString())], [], classes, now);
    expect(atNow.upcoming).toEqual([]);
  });

  it("orders a tie by title and past due work most recent first", () => {
    const tied = pickDeadlines(
      [activity("b", tomorrow, { title: "Beta" }), activity("a", tomorrow, { title: "Alpha" })],
      [],
      classes,
      now,
    );
    expect(ids(tied.upcoming)).toEqual(["a", "b"]);
    const missed = pickDeadlines(
      [activity("old", lastWeek), activity("recent", yesterday)],
      [cell("old", "missing"), cell("recent", "missing")],
      classes,
      now,
    );
    expect(ids(missed.pastDue)).toEqual(["recent", "old"]);
  });

  it("keeps undated work in the given order and does not change its input", () => {
    const given = [activity("z", null), activity("y", null)];
    expect(ids(pickDeadlines(given, [], classes, now).undated)).toEqual(["z", "y"]);
    expect(ids(given)).toEqual(["z", "y"]);
  });
});

describe("shownDeadlines", () => {
  const many = (count: number, dueAt: string | null, prefix: string, state: GradeState = "none") =>
    Array.from({ length: count }, (_, index) => ({
      id: `${prefix}-${index}`,
      title: `${prefix} ${String(index).padStart(2, "0")}`,
      kind: "Quiz" as const,
      classCode: "INTE 301",
      dueAt,
      state,
    }));

  it("shows everything when there are ten or fewer", () => {
    const shown = shownDeadlines({ upcoming: many(6, tomorrow, "u"), undated: many(4, null, "n"), pastDue: [] });
    expect([shown.upcoming.length, shown.undated.length, shown.more]).toEqual([6, 4, 0]);
  });

  it("limits the list to ten, dated first, and counts the rest", () => {
    const shown = shownDeadlines({ upcoming: many(8, tomorrow, "u"), undated: many(6, null, "n"), pastDue: [] });
    expect([shown.upcoming.length, shown.undated.length, shown.more]).toEqual([8, 2, 4]);
    const dated = shownDeadlines({ upcoming: many(14, tomorrow, "u"), undated: many(1, null, "n"), pastDue: [] });
    expect([dated.upcoming.length, dated.undated.length, dated.more]).toEqual([deadlineLimit, 0, 5]);
  });

  it("keeps the past due list short", () => {
    const shown = shownDeadlines({ upcoming: [], undated: [], pastDue: many(7, yesterday, "p", "missing") });
    expect([shown.pastDue.length, shown.morePastDue]).toEqual([pastDueLimit, 2]);
  });

  it("words the rest", () => {
    expect(moreLabel(4)).toBe("and 4 more");
  });
});
