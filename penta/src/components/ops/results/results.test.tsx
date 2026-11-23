import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import type { Activity, Attempt } from "@/lib/quiz";
import { itemAnalysis, studentRows, type QuizResultsData } from "@/lib/quiz-results";
import { ItemList } from "./ItemList";
import { ResultsView } from "./ResultsView";
import { StudentTable } from "./StudentTable";

afterEach(cleanup);

const activity: Activity = {
  id: "quiz-1",
  classId: "class-1",
  lessonId: null,
  type: "quiz",
  title: "Message brokers",
  instructionsMd: "",
  points: 3,
  dueAt: null,
  publishedAt: "2026-11-26T00:00:00.000Z",
  requiresDeckId: null,
  attemptLimit: 2,
  timeLimitMin: null,
  showAnswers: "never",
};

function attempt(id: string, studentId: string, overrides: Partial<Attempt> = {}): Attempt {
  return {
    id,
    activityId: "quiz-1",
    studentId,
    attemptNo: 1,
    startedAt: "2026-11-26T01:00:00.000Z",
    expiresAt: null,
    submittedAt: "2026-11-26T02:00:00.000Z",
    score: 0,
    maxScore: 3,
    ...overrides,
  };
}

const longPrompt = "Which part of a message broker keeps a message until a consumer is ready to take it? ".repeat(6).trim();

const results: QuizResultsData = {
  roster: [
    { id: "s-cruz", fullName: "Jose Cruz" },
    { id: "s-abad", fullName: "Ana Abad" },
    { id: "s-reyes", fullName: "Maria Reyes" },
    { id: "s-idle", fullName: "Zed Idle" },
  ],
  attempts: [
    attempt("a1", "s-abad", { score: 1 }),
    attempt("a2", "s-abad", { attemptNo: 2, score: 3, submittedAt: "2026-11-27T15:59:00.000Z" }),
    attempt("a3", "s-cruz", { score: 2 }),
    attempt("a4", "s-cruz", { attemptNo: 2, submittedAt: null, score: null }),
    attempt("a5", "s-reyes", { submittedAt: null, score: null }),
    attempt("a6", "s-gone", { score: 0 }),
  ],
  questions: [
    { id: "q1", kind: "mcq", prompt: longPrompt, points: 2, position: 1 },
    { id: "q2", kind: "ident", prompt: "Name the pattern.", points: 1, position: 2 },
  ],
  answers: [
    { attemptId: "a1", questionId: "q1", isCorrect: false },
    { attemptId: "a1", questionId: "q2", isCorrect: true },
    { attemptId: "a2", questionId: "q1", isCorrect: true },
    { attemptId: "a2", questionId: "q2", isCorrect: true },
    { attemptId: "a3", questionId: "q1", isCorrect: true },
    { attemptId: "a3", questionId: "q2", isCorrect: false },
    { attemptId: "a6", questionId: "q1", isCorrect: false },
    { attemptId: "a6", questionId: "q2", isCorrect: false },
  ],
};

function cells(row: HTMLElement): string[] {
  return [...row.querySelectorAll("th, td")].map((cell) => cell.textContent ?? "");
}

describe("StudentTable", () => {
  it("is a real table with a caption and scoped headers", () => {
    render(<StudentTable rows={studentRows(results.roster, results.attempts)} />);
    const table = screen.getByRole("table", { name: "Best score per student" });
    expect(table.querySelector("caption")?.textContent).toBe("Best score per student");
    const headers = within(table).getAllByRole("columnheader");
    expect(headers.map((header) => header.textContent)).toEqual([
      "Student",
      "Best score",
      "Percent",
      "Attempts",
      "Submitted",
    ]);
    expect(headers.every((header) => header.getAttribute("scope") === "col")).toBe(true);
    const names = within(table).getAllByRole("rowheader");
    expect(names.every((name) => name.getAttribute("scope") === "row" && name.getAttribute("dir") === "auto")).toBe(true);
  });

  it("shows a row for each state, sorted by name", () => {
    render(<StudentTable rows={studentRows(results.roster, results.attempts)} />);
    const rows = screen.getAllByRole("row").slice(1);
    expect(rows.map(cells)).toEqual([
      ["Ana Abad", "3 of 3", "100%", "2", "Nov 27, 2026, 11:59 PM, Manila time"],
      ["Jose Cruz", "2 of 3", "66%", "2, one in progress", "Nov 26, 2026, 10:00 AM, Manila time"],
      ["Maria Reyes", "In progress", "None", "1", "None"],
      ["Removed student", "0 of 3", "0%", "1", "Nov 26, 2026, 10:00 AM, Manila time"],
      ["Zed Idle", "Not started", "None", "0", "None"],
    ]);
  });

  it("wraps the table in its own scroll box that the keyboard can reach", () => {
    render(<StudentTable rows={studentRows(results.roster, results.attempts)} />);
    const box = screen.getByRole("region", { name: "Best score per student" });
    expect(box.getAttribute("tabindex")).toBe("0");
    expect(box.querySelector("table")).toBeTruthy();
  });

  it("renders a name with markup as text", () => {
    const { container } = render(
      <StudentTable rows={studentRows([{ id: "s-x", fullName: "<img src=x onerror=alert(1)>" }], [])} />,
    );
    expect(container.querySelector("img")).toBeNull();
    expect(screen.getByText("<img src=x onerror=alert(1)>")).toBeTruthy();
  });
});

describe("ItemList", () => {
  it("lists each question with its number, kind, points and count in words", () => {
    render(<ItemList items={itemAnalysis(results.questions, results.attempts, results.answers)} />);
    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(2);
    for (const text of ["Question 1", "Multiple choice", "2 points", "1 of 3 correct, 33%"]) {
      expect(items[0].textContent).toContain(text);
    }
    for (const text of ["Question 2", "Identification", "1 point", "Name the pattern.", "1 of 3 correct, 33%"]) {
      expect(items[1].textContent).toContain(text);
    }
  });

  it("keeps the full prompt in the page", () => {
    render(<ItemList items={itemAnalysis(results.questions, results.attempts, results.answers)} />);
    const prompt = screen.getByText(longPrompt);
    expect(prompt.getAttribute("dir")).toBe("auto");
    expect(prompt.closest("details")).toBeTruthy();
  });

  it("hides the bar from assistive technology and sizes it by the percent", () => {
    const { container } = render(
      <ItemList items={itemAnalysis(results.questions, results.attempts, results.answers)} />,
    );
    const fills = [...container.querySelectorAll<HTMLElement>("[data-fill]")];
    expect(fills.map((fill) => fill.style.width)).toEqual(["33%", "33%"]);
    expect(fills.every((fill) => fill.parentElement?.getAttribute("aria-hidden") === "true")).toBe(true);
  });

  it("says when nothing was submitted", () => {
    const { container } = render(<ItemList items={itemAnalysis(results.questions, [results.attempts[4]], [])} />);
    expect(screen.getAllByText("No submissions yet")).toHaveLength(2);
    expect(container.querySelector<HTMLElement>("[data-fill]")?.style.width).toBe("0%");
  });
});

describe("ResultsView", () => {
  it("shows the title as the one h1, the labels and a link back to the quiz", () => {
    render(<ResultsView activity={activity} results={results} />);
    expect(screen.getAllByRole("heading", { level: 1 }).map((heading) => heading.textContent)).toEqual([
      "Message brokers",
    ]);
    expect(screen.getByRole("link", { name: "Back to the quiz" }).getAttribute("href")).toBe("/ops/quiz-1");
    for (const text of ["Results", "3 points", "4 students"]) expect(screen.getByText(text)).toBeTruthy();
  });

  it("shows the summary, the table and the item analysis", () => {
    render(<ResultsView activity={activity} results={results} />);
    expect(screen.getByText("3 submitted · 1 in progress · 1 not started")).toBeTruthy();
    expect(screen.getByText("Average 1.7 of 3 · Highest 3 · Lowest 0")).toBeTruthy();
    expect(screen.getByRole("table", { name: "Best score per student" })).toBeTruthy();
    expect(screen.getByRole("heading", { level: 2, name: "Percent correct per question" })).toBeTruthy();
    expect(screen.getByText("Based on each student's first submitted attempt.")).toBeTruthy();
    expect(screen.queryByText(/accepted|answer key/i)).toBeNull();
  });

  it("shows the empty state when nobody has attempted", () => {
    render(<ResultsView activity={activity} results={{ ...results, attempts: [], answers: [] }} />);
    expect(screen.getByText("No attempts yet. Scores show up here when a student starts the quiz.")).toBeTruthy();
    expect(screen.queryByRole("table")).toBeNull();
    expect(screen.queryByText("Percent correct per question")).toBeNull();
  });

  it("shows an alert when the results cannot be loaded", () => {
    render(<ResultsView activity={activity} results={null} />);
    expect(screen.getByRole("alert").textContent).toBe("Could not load the results. Reload the page to try again.");
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
  });
});
