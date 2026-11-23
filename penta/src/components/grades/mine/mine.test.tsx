import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import type { GradeState, OwnGradeCell } from "@/lib/grades";
import type { Activity } from "@/lib/quiz";

const mocks = vi.hoisted(() => ({
  listStudentClasses: vi.fn(),
  loadActivities: vi.fn(),
  loadMyGrades: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({}) }));
vi.mock("@/lib/classes", () => ({ listStudentClasses: mocks.listStudentClasses }));
vi.mock("@/lib/quiz", () => ({ loadActivities: mocks.loadActivities }));
vi.mock("@/lib/grades", async (original) => ({
  ...(await original<typeof import("@/lib/grades")>()),
  loadMyGrades: mocks.loadMyGrades,
}));

import { MyGrades } from "../MyGrades";

const student = { id: "s-bea", fullName: "Bea Cruz", role: "student" as const };

function summary(id: string, code: string, title: string) {
  return { id, code, title, section: "", term: "", teacherName: "Tess Lim" };
}

function activity(id: string, classId: string, overrides: Partial<Activity> = {}): Activity {
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

function cell(activityId: string, state: GradeState, overrides: Partial<OwnGradeCell> = {}): OwnGradeCell {
  return { classId: "class-1", activityId, state, score: null, points: 20, late: false, submittedAt: null, ...overrides };
}

const classes = [summary("class-1", "INTE 301", "Systems Integration"), summary("class-2", "ITEC 204", "Networks")];

const activities = [
  activity("quiz-1", "class-1", { title: "Brokers", dueAt: "2026-11-28T15:59:00.000Z" }),
  activity("upload-1", "class-1", { title: "Essay", type: "upload", points: 30 }),
  activity("quiz-2", "class-1", { title: "Queues", points: 10 }),
  activity("quiz-3", "class-1", { title: "Topics" }),
  activity("quiz-4", "class-1", { title: "Gateways" }),
  activity("draft-1", "class-1", { title: "Hidden draft", publishedAt: null }),
];

const cells = [
  cell("quiz-1", "graded", { score: 18, late: true }),
  cell("upload-1", "submitted", { points: 30, late: true }),
  cell("quiz-2", "missing", { points: 10 }),
  cell("quiz-3", "in_progress"),
  cell("quiz-4", "none"),
];

async function renderGrades() {
  render(await MyGrades({ user: student }));
}

function rowTexts(table: HTMLElement, title: string): string[] {
  const row = within(table).getByRole("rowheader", { name: title }).closest("tr");
  return [...(row?.querySelectorAll("td") ?? [])].map((item) => item.textContent ?? "");
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.listStudentClasses.mockResolvedValue(classes);
  mocks.loadActivities.mockResolvedValue(activities);
  mocks.loadMyGrades.mockResolvedValue(cells);
});

afterEach(cleanup);

describe("MyGrades", () => {
  it("makes a section per class headed by its title and code", async () => {
    await renderGrades();
    expect(screen.getAllByRole("heading", { level: 2 }).map((item) => item.textContent)).toEqual([
      "Systems Integration[ INTE 301 ]",
      "Networks[ ITEC 204 ]",
    ]);
    expect(screen.queryByRole("heading", { level: 1 })).toBeNull();
    expect(mocks.loadMyGrades).toHaveBeenCalledTimes(1);
  });

  it("renders a captioned table in a labelled scroll region", async () => {
    await renderGrades();
    const region = screen.getByRole("region", { name: "Your scores in this class" });
    expect(region.getAttribute("tabindex")).toBe("0");
    const table = within(region).getByRole("table", { name: "Your scores in this class" });
    expect(within(table).getAllByRole("columnheader").map((item) => item.textContent)).toEqual([
      "Activity",
      "Kind",
      "Due",
      "Score",
      "Status",
    ]);
  });

  it("writes a row per published activity with its link, kind, due time, score and status", async () => {
    await renderGrades();
    const table = screen.getByRole("table");
    expect(within(table).getAllByRole("rowheader").map((item) => item.textContent)).toEqual([
      "Brokers",
      "Essay",
      "Queues",
      "Topics",
      "Gateways",
    ]);
    expect(within(table).getByRole("link", { name: "Essay" }).getAttribute("href")).toBe("/ops/upload-1");
    expect(rowTexts(table, "Brokers")).toEqual(["Quiz", "Nov 28, 11:59 PM", "18 of 20", "GradedLate"]);
    expect(rowTexts(table, "Essay")).toEqual(["Upload", "No due date", "", "Not gradedLate"]);
    expect(rowTexts(table, "Queues")).toEqual(["Quiz", "No due date", "", "Missing"]);
    expect(rowTexts(table, "Topics")).toEqual(["Quiz", "No due date", "", "In progress"]);
    expect(rowTexts(table, "Gateways")).toEqual(["Quiz", "No due date", "", ""]);
  });

  it("writes the class totals and the note about what counts", async () => {
    await renderGrades();
    expect(screen.getByText("18 of 30 · 60% · Not graded: 1")).toBeTruthy();
    expect(
      screen.getByText(
        "Missing work counts as zero. Work that is handed in but not graded is left out of totals until it is graded.",
      ),
    ).toBeTruthy();
  });

  it("says when a class has no published activities", async () => {
    await renderGrades();
    expect(screen.getAllByText("No graded work in this class yet.")).toHaveLength(1);
    expect(screen.getAllByRole("table")).toHaveLength(1);
  });

  it("says when nothing counts yet", async () => {
    mocks.loadMyGrades.mockResolvedValue(cells.map((item) => ({ ...item, state: "none", score: null, late: false })));
    await renderGrades();
    expect(screen.getByText("No graded work yet")).toBeTruthy();
  });

  it("refuses to show a table when cells are missing", async () => {
    mocks.loadMyGrades.mockResolvedValue(cells.slice(0, 2));
    await renderGrades();
    expect(screen.getByRole("alert").textContent).toBe("Could not load these grades. Reload the page.");
    expect(screen.queryByRole("table")).toBeNull();
  });

  it("points a student with no classes to the classes page", async () => {
    mocks.listStudentClasses.mockResolvedValue([]);
    await renderGrades();
    expect(screen.getByText(/to see grades here\./).textContent).toBe("Join a class to see grades here.");
    expect(screen.getByRole("link", { name: "Join a class" }).getAttribute("href")).toBe("/classes");
    expect(screen.queryByRole("table")).toBeNull();
  });
});
