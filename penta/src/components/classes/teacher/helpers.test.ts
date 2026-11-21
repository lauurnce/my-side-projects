import { describe, expect, it } from "vitest";
import { countByClass, countLabel, formatJoinedDate, toRosterRows } from "./helpers";

describe("formatJoinedDate", () => {
  it("shows the date in Manila time", () => {
    expect(formatJoinedDate("2026-11-27T02:00:00Z")).toBe("Nov 27, 2026");
  });

  it("rolls over to the next day after 16:00 UTC", () => {
    expect(formatJoinedDate("2026-11-26T15:59:59Z")).toBe("Nov 26, 2026");
    expect(formatJoinedDate("2026-11-26T16:00:00Z")).toBe("Nov 27, 2026");
  });

  it("does not throw on a bad value", () => {
    expect(formatJoinedDate("not a date")).toBe("Unknown date");
  });
});

describe("countLabel", () => {
  it("uses the singular only for one", () => {
    expect(countLabel(0, "student", "students")).toBe("0 students");
    expect(countLabel(1, "class", "classes")).toBe("1 class");
    expect(countLabel(12, "class", "classes")).toBe("12 classes");
  });
});

describe("countByClass", () => {
  it("counts enrollments per class", () => {
    const counts = countByClass([{ class_id: "a" }, { class_id: "b" }, { class_id: "a" }]);
    expect(counts.get("a")).toBe(2);
    expect(counts.get("b")).toBe(1);
    expect(counts.get("c")).toBeUndefined();
  });
});

describe("toRosterRows", () => {
  const enrollments = [
    { student_id: "s1", joined_at: "2026-11-20T01:00:00Z" },
    { student_id: "s2", joined_at: "2026-11-21T01:00:00Z" },
    { student_id: "s3", joined_at: "2026-11-22T01:00:00Z" },
  ];

  it("joins names and sorts by name", () => {
    const rows = toRosterRows(enrollments, [
      { id: "s1", full_name: "Sam Student" },
      { id: "s2", full_name: "ana Reyes" },
      { id: "s3", full_name: "Ben Cruz" },
    ]);
    expect(rows.map((row) => row.fullName)).toEqual(["ana Reyes", "Ben Cruz", "Sam Student"]);
    expect(rows[2]).toEqual({ studentId: "s1", fullName: "Sam Student", joinedAt: "2026-11-20T01:00:00Z" });
  });

  it("keeps a row when the profile is missing", () => {
    const rows = toRosterRows(enrollments.slice(0, 1), []);
    expect(rows).toEqual([{ studentId: "s1", fullName: "Unknown student", joinedAt: "2026-11-20T01:00:00Z" }]);
  });
});
