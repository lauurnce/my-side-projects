import { describe, expect, it } from "vitest";
import { attemptOn, fixedNow, openOn, pastDue, quiz } from "./fixtures";
import {
  activityCountLabel,
  chipFor,
  detailLine,
  dueCount,
  dueCountLabel,
  formatManilaShort,
  hubOrder,
  kindLine,
  nextDue,
  nextDueText,
  opsHref,
  opsItems,
} from "./helpers";

const activities = [
  quiz("closed", { dueAt: pastDue }),
  quiz("done"),
  quiz("open-late", { dueAt: "2026-12-05T15:59:00.000Z" }),
  quiz("open-none", { dueAt: null }),
  quiz("open-soon"),
  quiz("draft", { publishedAt: null }),
  quiz("running"),
];
const attempts = [attemptOn("done"), openOn("running")];
const items = opsItems({ activities, attempts, now: fixedNow });
const stateOf = (id: string) => items.find((item) => item.activity.id === id);

describe("formatManilaShort", () => {
  it("shows the Manila date and time with plain spaces and no year", () => {
    expect(process.env.TZ).toBe("UTC");
    expect(formatManilaShort("2026-11-28T15:59:00.000Z")).toBe("Nov 28, 11:59 PM");
    expect(formatManilaShort("2026-11-28T16:05:00.000Z")).toBe("Nov 29, 12:05 AM");
    expect(formatManilaShort("2026-01-01T01:00:00.000Z")).toBe("Jan 1, 9:00 AM");
    expect(formatManilaShort("2026-11-28T15:59:00.000Z")).not.toMatch(/[  ]/);
  });

  it("gives null for nothing or a bad date", () => {
    expect(formatManilaShort(null)).toBeNull();
    expect(formatManilaShort("")).toBeNull();
    expect(formatManilaShort("soon")).toBeNull();
  });
});

describe("opsItems", () => {
  it("drops drafts and finds the state and best attempt of each activity", () => {
    expect(items.map((item) => [item.activity.id, item.state])).toEqual([
      ["closed", "closed"],
      ["done", "done"],
      ["open-late", "open"],
      ["open-none", "open"],
      ["open-soon", "open"],
      ["running", "in_progress"],
    ]);
    expect(stateOf("done")?.best?.score).toBe(4);
    expect(stateOf("running")?.best).toBeNull();
  });
});

describe("chipFor", () => {
  it("says when an open quiz is due", () => {
    expect(chipFor(stateOf("open-soon")!)).toEqual({ status: "due", text: "Due Nov 28, 11:59 PM" });
  });

  it("says when an open quiz has no due date", () => {
    expect(chipFor(stateOf("open-none")!)).toEqual({ status: "due", text: "No due date" });
  });

  it("marks a running attempt", () => {
    expect(chipFor(stateOf("running")!)).toEqual({ status: "submitted", text: "In progress" });
  });

  it("shows the best score when done", () => {
    expect(chipFor(stateOf("done")!)).toEqual({ status: "graded", text: "Graded · 4 of 5" });
  });

  it("says closed for a missed quiz", () => {
    expect(chipFor(stateOf("closed")!)).toEqual({ status: "due", text: "Closed" });
  });

  it("never picks the gold chip", () => {
    const drafted = { activity: quiz("draft", { publishedAt: null }), state: "draft" as const, best: null };
    expect([...items, drafted].map((item) => chipFor(item).status)).not.toContain("late");
    expect([...items, drafted].map((item) => chipFor(item).status)).not.toContain("live");
  });
});

describe("detailLine", () => {
  it("shows points and the time limit", () => {
    expect(detailLine({ points: 12, timeLimitMin: 20 })).toBe("12 points · 20 minutes");
    expect(detailLine({ points: 12, timeLimitMin: null })).toBe("12 points · no time limit");
    expect(detailLine({ points: 1, timeLimitMin: 1 })).toBe("1 point · 1 minute");
  });
});

describe("hubOrder", () => {
  it("puts running first, then open by nearest due date, then done, then closed", () => {
    expect(hubOrder(items).map((item) => item.activity.id)).toEqual([
      "running",
      "open-soon",
      "open-late",
      "open-none",
      "done",
      "closed",
    ]);
  });

  it("keeps the given order inside a group and does not change its input", () => {
    const before = items.map((item) => item.activity.id);
    const two = opsItems({ activities: [quiz("b"), quiz("a")], attempts: [], now: fixedNow });
    expect(hubOrder(two).map((item) => item.activity.id)).toEqual(["b", "a"]);
    expect(items.map((item) => item.activity.id)).toEqual(before);
  });
});

describe("counts and labels", () => {
  it("counts open and running activities as due", () => {
    expect(dueCount(items)).toBe(4);
    expect(dueCount([])).toBe(0);
    expect(dueCountLabel(3)).toBe("3 due");
    expect(dueCountLabel(0)).toBe("0 due");
  });

  it("words the activity count", () => {
    expect(activityCountLabel(0)).toBe("0 activities");
    expect(activityCountLabel(1)).toBe("1 activity");
    expect(activityCountLabel(3)).toBe("3 activities");
  });

  it("builds the kind line and the link", () => {
    expect(kindLine("INTE 301")).toBe("Quiz · INTE 301");
    expect(opsHref("abc")).toBe("/ops/abc");
  });
});

describe("nextDue", () => {
  it("picks the open activity with the nearest due date", () => {
    const next = nextDue(items);
    expect(next?.activity.id).toBe("open-soon");
    expect(nextDueText(next!)).toBe("Next due: Quiz open-soon, Nov 28, 11:59 PM");
  });

  it("skips running, done, closed and undated activities", () => {
    const rest = items.filter((item) => !["open-soon", "open-late"].includes(item.activity.id));
    expect(nextDue(rest)).toBeNull();
    expect(nextDue([])).toBeNull();
  });
});
