import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import type { GradeCell, GradeState } from "@/lib/grades";
import type { Activity } from "@/lib/quiz";

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  loadClassActivities: vi.fn(),
  loadClassGradebook: vi.fn(),
  notFound: vi.fn(() => {
    throw new Error("not found");
  }),
}));

vi.mock("next/navigation", () => ({ notFound: mocks.notFound }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ from: mocks.from }) }));
vi.mock("@/lib/quiz", () => ({ loadClassActivities: mocks.loadClassActivities }));
vi.mock("@/lib/grades", async (original) => ({
  ...(await original<typeof import("@/lib/grades")>()),
  loadClassGradebook: mocks.loadClassGradebook,
}));

import { ClassGradebook } from "../ClassGradebook";

const classId = "7b0f6a52-1c1d-4f6e-9d55-0d6d3a1f2c11";
const teacher = { id: "teacher-1", fullName: "Tess Lim", role: "teacher" as const };

function activity(id: string, overrides: Partial<Activity> = {}): Activity {
  return {
    id,
    classId,
    type: "quiz",
    lessonId: null,
    title: id,
    instructionsMd: "",
    points: 20,
    dueAt: null,
    publishedAt: "2026-11-26T00:00:00.000Z",
    requiresDeckId: null,
    attemptLimit: 1,
    timeLimitMin: null,
    showAnswers: "never",
    ...overrides,
  };
}

function cell(studentId: string, activityId: string, state: GradeState, overrides: Partial<GradeCell> = {}): GradeCell {
  return { studentId, activityId, state, score: null, points: 20, late: false, submittedAt: null, ...overrides };
}

const activities = [
  activity("quiz-1", { title: "Brokers" }),
  activity("upload-1", { title: "Essay", type: "upload", points: 30 }),
  activity("quiz-2", { title: "Queues", points: 1 }),
  activity("draft-1", { title: "Hidden draft", publishedAt: null }),
];

const enrollments = [{ student_id: "s-carl" }, { student_id: "s-bea" }];
const profiles = [
  { id: "s-bea", full_name: "Bea Cruz" },
  { id: "s-carl", full_name: "Carl Santos" },
];

const cells = [
  cell("s-bea", "quiz-1", "graded", { score: 18 }),
  cell("s-bea", "upload-1", "submitted", { points: 30, late: true }),
  cell("s-bea", "quiz-2", "missing", { points: 1 }),
  cell("s-carl", "quiz-1", "in_progress"),
  cell("s-carl", "upload-1", "graded", { points: 30, score: 27, late: true }),
  cell("s-carl", "quiz-2", "none", { points: 1 }),
  cell("s-gone", "quiz-1", "graded", { score: 20 }),
  cell("s-gone", "upload-1", "none", { points: 30 }),
  cell("s-gone", "quiz-2", "none", { points: 1 }),
];

type Result = { data: unknown; error: unknown };

function query(result: Result) {
  const chain = {
    select: () => chain,
    eq: () => chain,
    in: () => chain,
    maybeSingle: async () => result,
    then: (resolve: (value: Result) => unknown) => Promise.resolve(result).then(resolve),
  };
  return chain;
}

function useTables(tables: Record<string, Result>) {
  mocks.from.mockImplementation((table: string) => query(tables[table]));
}

const readyTables = {
  classes: { data: { code: "INTE 301", title: "Systems Integration" }, error: null },
  enrollments: { data: enrollments, error: null },
  profiles: { data: profiles, error: null },
};

async function renderGradebook() {
  render(await ClassGradebook({ user: teacher, classId }));
}

function rowTexts(name: string): string[] {
  const row = screen.getByRole("rowheader", { name }).closest("tr");
  return [...(row?.querySelectorAll("td") ?? [])].map((item) => item.textContent ?? "");
}

beforeEach(() => {
  vi.clearAllMocks();
  useTables(readyTables);
  mocks.loadClassActivities.mockResolvedValue(activities);
  mocks.loadClassGradebook.mockResolvedValue(cells);
});

afterEach(cleanup);

describe("ClassGradebook", () => {
  it("shows the class, the counts and one heading", async () => {
    await renderGradebook();
    expect(screen.getAllByRole("heading", { level: 1 }).map((item) => item.textContent)).toEqual([
      "Systems Integration",
    ]);
    expect(screen.getByText("2 students · 3 activities")).toBeTruthy();
    expect(screen.getByText("INTE 301")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Back to the class" }).getAttribute("href")).toBe(`/classes/${classId}`);
  });

  it("links the export as a download", async () => {
    await renderGradebook();
    const link = screen.getByRole("link", { name: "Export CSV" });
    expect(link.getAttribute("href")).toBe(`/classes/${classId}/grades.csv`);
    expect(link.hasAttribute("download")).toBe(true);
  });

  it("loads the cells with one call and never asks for emails", async () => {
    await renderGradebook();
    expect(mocks.loadClassGradebook).toHaveBeenCalledTimes(1);
    expect(mocks.loadClassGradebook.mock.calls[0][1]).toBe(classId);
    expect(mocks.from.mock.calls.map(([table]) => table).sort()).toEqual(["classes", "enrollments", "profiles"]);
  });

  it("renders a captioned table in a labelled scroll region", async () => {
    await renderGradebook();
    const region = screen.getByRole("region", { name: "Scores by student and activity" });
    expect(region.getAttribute("tabindex")).toBe("0");
    expect(within(region).getByRole("table", { name: "Scores by student and activity" })).toBeTruthy();
  });

  it("heads a column per published activity with its link, kind and points", async () => {
    await renderGradebook();
    const headers = screen.getAllByRole("columnheader");
    expect(headers.map((item) => item.getAttribute("scope"))).toEqual(Array(7).fill("col"));
    expect(headers.map((item) => item.textContent)).toEqual([
      "Student",
      "BrokersQuiz · 20 pts",
      "EssayUpload · 30 pts",
      "QueuesQuiz · 1 pt",
      "Total",
      "Percent",
      "Not graded",
    ]);
    expect(screen.getByRole("link", { name: "Essay" }).getAttribute("href")).toBe("/ops/upload-1");
    expect(screen.queryByText("Hidden draft")).toBeNull();
  });

  it("heads a row per student by name with the removed student last", async () => {
    await renderGradebook();
    const headers = screen.getAllByRole("rowheader");
    expect(headers.map((item) => item.textContent)).toEqual(["Bea Cruz", "Carl Santos", "Removed student"]);
    expect(headers.every((item) => item.getAttribute("scope") === "row" && item.getAttribute("dir") === "auto")).toBe(
      true,
    );
    expect(headers[2].closest("tr")?.getAttribute("data-removed")).toBe("true");
  });

  it("writes each cell state as a word with the late mark and the totals", async () => {
    await renderGradebook();
    expect(rowTexts("Bea Cruz")).toEqual(["18", "Not gradedLate", "Missing", "18 of 21", "85%", "1"]);
    expect(rowTexts("Carl Santos")).toEqual(["In progress", "27Late", "", "27 of 30", "90%", "0"]);
    expect(rowTexts("Removed student")).toEqual(["20", "", "", "20 of 20", "100%", "0"]);
    expect(screen.getAllByText("Late")).toHaveLength(2);
  });

  it("says how totals are counted and that altitude is not a grade", async () => {
    await renderGradebook();
    expect(
      screen.getByText(
        "Missing work counts as zero. Work that is handed in but not graded is left out of totals until it is graded.",
      ),
    ).toBeTruthy();
    expect(screen.getByText("Altitude is progress, not a grade, and is not part of this gradebook.")).toBeTruthy();
  });

  it("says when nothing counts yet", async () => {
    mocks.loadClassGradebook.mockResolvedValue(
      enrollments.flatMap(({ student_id }) => activities.slice(0, 3).map((item) => cell(student_id, item.id, "none"))),
    );
    await renderGradebook();
    expect(rowTexts("Bea Cruz").slice(-3)).toEqual(["No graded work yet", "", "0"]);
  });

  it("shows an empty state when no students have joined", async () => {
    useTables({ ...readyTables, enrollments: { data: [], error: null } });
    mocks.loadClassGradebook.mockResolvedValue([]);
    await renderGradebook();
    expect(screen.getByText("No students have joined this class yet.")).toBeTruthy();
    expect(screen.queryByRole("table")).toBeNull();
    expect(screen.getByText("0 students · 3 activities")).toBeTruthy();
  });

  it("shows an empty state when nothing is published", async () => {
    mocks.loadClassActivities.mockResolvedValue([activities[3]]);
    mocks.loadClassGradebook.mockResolvedValue([]);
    await renderGradebook();
    expect(screen.getByText("No published activities yet. Publish an activity to start the gradebook.")).toBeTruthy();
    expect(screen.queryByRole("table")).toBeNull();
  });

  it("refuses to show a table when the roster cannot be read", async () => {
    useTables({ ...readyTables, profiles: { data: null, error: { message: "failed" } } });
    await renderGradebook();
    expect(screen.getByRole("alert").textContent).toBe("Could not load every grade. Reload the page.");
    expect(screen.queryByRole("table")).toBeNull();
    expect(screen.queryByRole("link", { name: "Export CSV" })).toBeNull();
  });

  it("refuses to show a table when cells are missing", async () => {
    mocks.loadClassGradebook.mockResolvedValue(cells.slice(0, 4));
    await renderGradebook();
    expect(screen.getByRole("alert")).toBeTruthy();
    expect(screen.queryByRole("table")).toBeNull();
  });

  it("is not found for a class the teacher does not own", async () => {
    useTables({ ...readyTables, classes: { data: null, error: null } });
    await expect(renderGradebook()).rejects.toThrow("not found");
    expect(mocks.loadClassGradebook).not.toHaveBeenCalled();
  });
});
