import { describe, expect, it } from "vitest";
import { csvFile } from "@/lib/csv";
import { gradeTotals, type GradeCell, type GradeState } from "@/lib/grades";
import {
  cellText,
  gradebookCsvRows,
  gradebookModel,
  gradesFileName,
  scoreOfPoints,
  statusText,
  totalsLine,
  totalsText,
  type GradebookInput,
} from "./gradebook";

const activities: GradebookInput["activities"] = [
  { id: "quiz-1", type: "quiz", title: "Brokers", points: 20, dueAt: "2026-11-20T15:59:00.000Z" },
  { id: "upload-1", type: "upload", title: "Essay", points: 30, dueAt: null },
  { id: "quiz-2", type: "quiz", title: "Queues", points: 10, dueAt: "2026-11-21T15:59:00.000Z" },
];

const roster = [
  { id: "s-carl", fullName: "carl Santos" },
  { id: "s-bea", fullName: "Bea Cruz" },
  { id: "s-alv", fullName: "Álvarez Reyes" },
];

function cell(studentId: string, activityId: string, state: GradeState, overrides: Partial<GradeCell> = {}): GradeCell {
  const points = activities.find((activity) => activity.id === activityId)?.points ?? 0;
  return { studentId, activityId, state, score: null, points, late: false, submittedAt: null, ...overrides };
}

const cells: GradeCell[] = [
  cell("s-bea", "quiz-1", "graded", { score: 18 }),
  cell("s-bea", "upload-1", "submitted", { late: true }),
  cell("s-bea", "quiz-2", "missing"),
  cell("s-carl", "quiz-1", "in_progress", { late: true }),
  cell("s-carl", "upload-1", "none"),
  cell("s-carl", "quiz-2", "graded", { score: 9, late: true }),
  cell("s-alv", "quiz-1", "graded", { score: 7 }),
  cell("s-alv", "upload-1", "graded", { score: 13 }),
  cell("s-alv", "quiz-2", "missing"),
  cell("s-gone", "quiz-1", "graded", { score: 20 }),
  cell("s-gone", "upload-1", "none"),
  cell("s-gone", "quiz-2", "none"),
  cell("s-bea", "draft-quiz", "graded", { score: 5, points: 5 }),
];

const model = gradebookModel({ activities, roster, cells });

function rowOf(studentId: string) {
  const row = model.rows.find((item) => item.studentId === studentId);
  if (!row) throw new Error(`no row for ${studentId}`);
  return row;
}

describe("gradebookModel", () => {
  it("makes one column per activity in the given order with a kind word", () => {
    expect(model.columns).toEqual([
      { id: "quiz-1", title: "Brokers", kind: "Quiz", points: 20, dueAt: "2026-11-20T15:59:00.000Z" },
      { id: "upload-1", title: "Essay", kind: "Upload", points: 30, dueAt: null },
      { id: "quiz-2", title: "Queues", kind: "Quiz", points: 10, dueAt: "2026-11-21T15:59:00.000Z" },
    ]);
  });

  it("sorts students by name across accents and capitals and puts removed students last", () => {
    expect(model.rows.map((row) => row.name)).toEqual(["Álvarez Reyes", "Bea Cruz", "carl Santos", "Removed student"]);
    expect(model.rows.map((row) => row.removed)).toEqual([false, false, false, true]);
    expect(model.rows[3].studentId).toBe("s-gone");
  });

  it("gives every row a cell per column", () => {
    expect(model.rows.every((row) => row.cells.length === 3)).toBe(true);
    expect(rowOf("s-bea").cells).toEqual([
      { state: "graded", score: 18, points: 20, late: false },
      { state: "submitted", score: null, points: 30, late: true },
      { state: "missing", score: null, points: 10, late: false },
    ]);
  });

  it("keeps the late mark only for graded or handed in work", () => {
    expect(rowOf("s-carl").cells.map((item) => item.late)).toEqual([false, false, true]);
  });

  it("takes totals from gradeTotals and rounds the percent down", () => {
    for (const row of model.rows) expect(row.totals).toEqual(gradeTotals(row.cells));
    expect(rowOf("s-bea").totals).toEqual({ earned: 18, possible: 30, percent: 60, notGraded: 1 });
    expect(rowOf("s-alv").totals).toEqual({ earned: 20, possible: 60, percent: 33, notGraded: 0 });
    expect(rowOf("s-gone").totals).toEqual({ earned: 20, possible: 20, percent: 100, notGraded: 0 });
  });

  it("leaves out cells of activities that are not shown", () => {
    expect(rowOf("s-bea").totals.possible).toBe(30);
  });

  it("fills a missing cell with nothing and says the model is not complete", () => {
    const partial = gradebookModel({ activities, roster, cells: cells.filter((item) => item.studentId !== "s-carl") });
    expect(partial.complete).toBe(false);
    expect(partial.rows[2].cells[0]).toEqual({ state: "none", score: null, points: 20, late: false });
    expect(model.complete).toBe(true);
  });

  it("handles a class with no students or no activities", () => {
    expect(gradebookModel({ activities, roster: [], cells: [] })).toMatchObject({ rows: [], complete: true });
    const noWork = gradebookModel({ activities: [], roster, cells: [] });
    expect(noWork.columns).toEqual([]);
    expect(noWork.rows.map((row) => row.totals.percent)).toEqual([null, null, null]);
  });

  it("breaks a tie between equal names by id", () => {
    const twins = gradebookModel({
      activities: [],
      roster: [
        { id: "b", fullName: "Ana Cruz" },
        { id: "a", fullName: "Ana Cruz" },
      ],
      cells: [],
    });
    expect(twins.rows.map((row) => row.studentId)).toEqual(["a", "b"]);
  });
});

describe("cellText", () => {
  it("says the same word for each state", () => {
    expect(rowOf("s-bea").cells.map(cellText)).toEqual(["18", "Not graded", "Missing"]);
    expect(rowOf("s-carl").cells.map(cellText)).toEqual(["In progress", "", "9"]);
  });

  it("clamps a score above the points and below zero", () => {
    const clamped = gradebookModel({
      activities,
      roster: [roster[1]],
      cells: [
        cell("s-bea", "quiz-1", "graded", { score: 25 }),
        cell("s-bea", "upload-1", "graded", { score: -4 }),
        cell("s-bea", "quiz-2", "none"),
      ],
    });
    expect(clamped.rows[0].cells.map(cellText)).toEqual(["20", "0", ""]);
    expect(clamped.rows[0].totals).toMatchObject({ earned: 20, possible: 50, percent: 40 });
    expect(cellText({ state: "graded", score: 25, points: 20 })).toBe("20");
  });

  it("writes a graded score with its points and a status word", () => {
    expect(rowOf("s-bea").cells.map(scoreOfPoints)).toEqual(["18 of 20", "", ""]);
    expect(rowOf("s-bea").cells.map(statusText)).toEqual(["Graded", "Not graded", "Missing"]);
  });
});

describe("totalsText", () => {
  it("writes the points, the percent and the not graded count", () => {
    expect(totalsText({ earned: 38, possible: 50, percent: 76, notGraded: 2 })).toEqual({
      total: "38 of 50",
      percent: "76%",
      notGraded: "Not graded: 2",
    });
    expect(totalsLine({ earned: 38, possible: 50, percent: 76, notGraded: 2 })).toBe("38 of 50 · 76% · Not graded: 2");
  });

  it("leaves out the count at zero and says when nothing counts", () => {
    expect(totalsText({ earned: 0, possible: 10, percent: 0, notGraded: 0 })).toEqual({
      total: "0 of 10",
      percent: "0%",
      notGraded: null,
    });
    expect(totalsText({ earned: 0, possible: 0, percent: null, notGraded: 1 })).toEqual({
      total: "No graded work yet",
      percent: null,
      notGraded: "Not graded: 1",
    });
    expect(totalsLine({ earned: 0, possible: 0, percent: null, notGraded: 0 })).toBe("No graded work yet");
  });
});

describe("gradebookCsvRows", () => {
  const rows = gradebookCsvRows(model);

  it("writes a header with two columns per activity and the totals", () => {
    expect(rows[0]).toEqual([
      "Student",
      "Brokers (score, out of 20)",
      "Brokers (status)",
      "Essay (score, out of 30)",
      "Essay (status)",
      "Queues (score, out of 10)",
      "Queues (status)",
      "Total earned",
      "Total possible",
      "Percent",
      "Not graded",
    ]);
  });

  it("gives every row as many cells as the header", () => {
    expect(rows).toHaveLength(5);
    expect(rows.every((row) => row.length === rows[0].length)).toBe(true);
  });

  it("exports scores as numbers and states as words", () => {
    expect(rows[2]).toEqual(["Bea Cruz", 18, "", "", "Not graded, Late", "", "Missing", 18, 30, 60, 1]);
    expect(rows[3]).toEqual(["carl Santos", "", "In progress", "", "", 9, "Late", 9, 10, 90, 0]);
    expect(rows[4][0]).toBe("Removed student");
  });

  it("leaves the percent empty when nothing counts", () => {
    const empty = gradebookCsvRows(
      gradebookModel({ activities, roster: [roster[0]], cells: activities.map((item) => cell("s-carl", item.id, "none")) }),
    );
    expect(empty[1].slice(-4)).toEqual([0, 0, "", 0]);
  });

  it("comes out of csvFile with formulas as text and scores as bare numbers", () => {
    const risky = gradebookModel({
      activities: [{ id: "quiz-1", type: "quiz", title: "+Quiz", points: 20, dueAt: null }],
      roster: [{ id: "s-evil", fullName: '=HYPERLINK("http://x","y")' }],
      cells: [cell("s-evil", "quiz-1", "graded", { score: 18 })],
    });
    const lines = csvFile(gradebookCsvRows(risky)).replace(/^﻿/, "").split("\r\n");
    expect(lines[0]).toBe(
      '"Student","\'+Quiz (score, out of 20)","\'+Quiz (status)","Total earned","Total possible","Percent","Not graded"',
    );
    expect(lines[1]).toBe('"\'=HYPERLINK(""http://x"",""y"")",18,"",18,20,90,0');
  });

  it("exports the word for a missing cell", () => {
    const file = csvFile(gradebookCsvRows(model));
    expect(file.split("\r\n")[1]).toBe('"Álvarez Reyes",7,"",13,"","","Missing",20,60,33,0');
    expect(file).not.toMatch(/s-bea|s-alv|quiz-1|upload-1/);
  });
});

describe("gradesFileName", () => {
  it("keeps letters, digits and dashes of the class code", () => {
    expect(gradesFileName("INTE 301")).toBe("INTE-301-grades.csv");
    expect(gradesFileName("  it/301 -- A  ")).toBe("it-301-A-grades.csv");
  });

  it("falls back when nothing safe is left", () => {
    expect(gradesFileName("")).toBe("grades.csv");
    expect(gradesFileName('"; \r\n ../ ñ')).toBe("grades.csv");
  });

  it("stays plain and short", () => {
    const name = gradesFileName(`${"a".repeat(200)}"\r\nX: y`);
    expect(name).toMatch(/^[A-Za-z0-9-]+-grades\.csv$/);
    expect(name.length).toBeLessThanOrEqual(71);
  });
});
