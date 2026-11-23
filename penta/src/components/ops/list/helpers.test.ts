import { describe, expect, it } from "vitest";
import { attemptOn, cellOn, fixedNow, openOn, pastDue, quiz, upload } from "./fixtures";
import {
  activityCountLabel,
  chipFor,
  chipsFor,
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
  uploadChips,
  uploadState,
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

describe("upload activities", () => {
  const uploads = [
    upload("fresh"),
    upload("undated", { dueAt: null }),
    upload("missed", { dueAt: pastDue }),
    upload("joined-after", { dueAt: pastDue }),
    upload("handed"),
    upload("handed-late", { dueAt: pastDue }),
    upload("scored"),
    upload("hidden", { publishedAt: null }),
  ];
  const cells = [
    cellOn("fresh"),
    cellOn("missed", { state: "missing" }),
    cellOn("joined-after"),
    cellOn("handed", { state: "submitted", submittedAt: "2026-11-27T01:00:00.000Z" }),
    cellOn("handed-late", { state: "submitted", late: true, submittedAt: "2026-11-27T01:00:00.000Z" }),
    cellOn("scored", { state: "graded", score: 18 }),
  ];
  const mixed = opsItems({ activities: [...uploads, quiz("open-quiz")], attempts: [], cells, now: fixedNow });
  const itemOf = (id: string) => mixed.find((item) => item.activity.id === id)!;

  it("takes the state of an upload from its cell and of a quiz from its attempts", () => {
    expect(mixed.map((item) => [item.activity.id, item.state])).toEqual([
      ["fresh", "open"],
      ["undated", "open"],
      ["missed", "open"],
      ["joined-after", "closed"],
      ["handed", "done"],
      ["handed-late", "done"],
      ["scored", "done"],
      ["open-quiz", "open"],
    ]);
    expect(itemOf("undated").cell).toBeNull();
    expect(itemOf("open-quiz").cell).toBeUndefined();
    expect(uploadState(upload("x", { publishedAt: null }), null, fixedNow)).toBe("draft");
  });

  it("picks the due chip before the due time", () => {
    expect(uploadChips(itemOf("fresh"))).toEqual([{ status: "due", text: "Due Nov 28, 11:59 PM" }]);
    expect(uploadChips(itemOf("undated"))).toEqual([{ status: "due", text: "No due date" }]);
  });

  it("says Missing on the due chip for past due work that counts", () => {
    expect(uploadChips(itemOf("missed"))).toEqual([{ status: "due", text: "Missing" }]);
  });

  it("says Past due without Missing when the work does not count against the student", () => {
    expect(uploadChips(itemOf("joined-after"))).toEqual([{ status: "due", text: "Past due" }]);
  });

  it("says Submitted, and adds the gold Late chip when the cell is late", () => {
    expect(uploadChips(itemOf("handed"))).toEqual([{ status: "submitted", text: "Submitted" }]);
    expect(uploadChips(itemOf("handed-late"))).toEqual([
      { status: "submitted", text: "Submitted" },
      { status: "late", text: "Late" },
    ]);
  });

  it("shows the score out of the points when graded", () => {
    expect(uploadChips(itemOf("scored"))).toEqual([{ status: "graded", text: "Graded · 18 of 20" }]);
    const unscored = { ...itemOf("scored"), cell: cellOn("scored", { state: "graded" as const }) };
    expect(uploadChips(unscored)).toEqual([{ status: "graded", text: "Graded · 0 of 20" }]);
  });

  it("keeps the quiz chip for a quiz", () => {
    expect(chipsFor(itemOf("open-quiz"))).toEqual([chipFor(itemOf("open-quiz"))]);
    expect(chipsFor(itemOf("scored"))).toEqual(uploadChips(itemOf("scored")));
  });

  it("words the kind and the detail of an upload", () => {
    expect(kindLine("COMP 015", "upload")).toBe("Upload · COMP 015");
    expect(kindLine("COMP 015", "quiz")).toBe("Quiz · COMP 015");
    expect(detailLine(upload("x"))).toBe("20 points · PDF or DOCX");
    expect(detailLine(upload("x", { points: 1 }))).toBe("1 point · PDF or DOCX");
  });

  it("counts uploads not yet handed in as due", () => {
    expect(dueCount(mixed)).toBe(4);
  });

  it("orders uploads not yet handed in with the open quizzes by due time", () => {
    expect(hubOrder(mixed).map((item) => item.activity.id)).toEqual([
      "missed",
      "fresh",
      "open-quiz",
      "undated",
      "handed",
      "handed-late",
      "scored",
      "joined-after",
    ]);
  });

  it("never names past due work as the next due", () => {
    expect(nextDue(mixed)?.activity.id).toBe("fresh");
    expect(nextDue([itemOf("missed"), itemOf("joined-after")])).toBeNull();
  });
});
