import { describe, expect, it } from "vitest";
import type { Attempt } from "@/lib/quiz";
import {
  countsLine,
  firstSubmittedAttempts,
  itemAnalysis,
  itemSentence,
  scoresLine,
  studentRows,
  summary,
  type AnswerMark,
  type ResultQuestion,
} from "./quiz-results";

let nextAttempt = 0;

function attempt(studentId: string, overrides: Partial<Attempt> = {}): Attempt {
  nextAttempt += 1;
  return {
    id: `attempt-${nextAttempt}`,
    activityId: "quiz-1",
    studentId,
    attemptNo: 1,
    startedAt: "2026-11-26T01:00:00.000Z",
    expiresAt: null,
    submittedAt: "2026-11-26T02:00:00.000Z",
    score: 0,
    maxScore: 12,
    ...overrides,
  };
}

function open(studentId: string, attemptNo = 1): Attempt {
  return attempt(studentId, { attemptNo, submittedAt: null, score: null });
}

const roster = [
  { id: "s-cruz", fullName: "Jose Cruz" },
  { id: "s-abad", fullName: "Ana Abad" },
  { id: "s-reyes", fullName: "Maria Reyes" },
];

const questions: ResultQuestion[] = [
  { id: "q2", kind: "tf", prompt: "A queue keeps order.", points: 1, position: 2 },
  { id: "q1", kind: "mcq", prompt: "Pick the broker.", points: 2, position: 1 },
];

function mark(attemptId: string, questionId: string, isCorrect: boolean): AnswerMark {
  return { attemptId, questionId, isCorrect };
}

describe("studentRows", () => {
  it("gives one row per enrolled student, sorted by name", () => {
    const rows = studentRows(roster, []);
    expect(rows.map((row) => row.name)).toEqual(["Ana Abad", "Jose Cruz", "Maria Reyes"]);
    expect(rows.every((row) => row.status === "not_started" && row.attempts === 0 && row.enrolled)).toBe(true);
    expect(rows[0]).toMatchObject({ bestScore: null, maxScore: null, submittedAt: null, inProgress: false });
  });

  it("takes the highest submitted score and counts every attempt", () => {
    const attempts = [
      attempt("s-abad", { attemptNo: 1, score: 5, submittedAt: "2026-11-26T02:00:00.000Z" }),
      attempt("s-abad", { attemptNo: 2, score: 9, submittedAt: "2026-11-26T03:00:00.000Z" }),
      attempt("s-abad", { attemptNo: 3, score: 7, submittedAt: "2026-11-26T04:00:00.000Z" }),
    ];
    const [row] = studentRows(roster, attempts);
    expect(row).toMatchObject({
      name: "Ana Abad",
      status: "submitted",
      bestScore: 9,
      maxScore: 12,
      attempts: 3,
      inProgress: false,
      submittedAt: "2026-11-26T03:00:00.000Z",
    });
  });

  it("breaks a tie with the earlier submission", () => {
    const attempts = [
      attempt("s-cruz", { attemptNo: 2, score: 8, submittedAt: "2026-11-26T05:00:00.000Z" }),
      attempt("s-cruz", { attemptNo: 1, score: 8, submittedAt: "2026-11-26T02:30:00.000Z" }),
    ];
    const row = studentRows(roster, attempts).find((item) => item.studentId === "s-cruz");
    expect(row?.bestScore).toBe(8);
    expect(row?.submittedAt).toBe("2026-11-26T02:30:00.000Z");
  });

  it("shows a student with only an open attempt as in progress, never as a zero", () => {
    const row = studentRows(roster, [open("s-reyes")]).find((item) => item.studentId === "s-reyes");
    expect(row).toMatchObject({
      status: "in_progress",
      bestScore: null,
      maxScore: null,
      attempts: 1,
      inProgress: true,
      submittedAt: null,
    });
  });

  it("keeps the best score while a retake is open", () => {
    const attempts = [attempt("s-abad", { score: 6 }), open("s-abad", 2)];
    const [row] = studentRows(roster, attempts);
    expect(row).toMatchObject({ status: "submitted", bestScore: 6, attempts: 2, inProgress: true });
  });

  it("keeps a real zero as a score", () => {
    const [row] = studentRows(roster, [attempt("s-abad", { score: 0 })]);
    expect(row).toMatchObject({ status: "submitted", bestScore: 0 });
  });

  it("adds a row for a student who has attempts but is no longer enrolled", () => {
    const attempts = [attempt("s-gone", { score: 4 }), attempt("s-abad", { score: 3 })];
    const rows = studentRows(roster, attempts);
    expect(rows.map((row) => row.name)).toEqual(["Ana Abad", "Jose Cruz", "Maria Reyes", "Removed student"]);
    expect(rows[3]).toMatchObject({ studentId: "s-gone", enrolled: false, status: "submitted", bestScore: 4, attempts: 1 });
  });

  it("gives each removed student a separate row", () => {
    const rows = studentRows([], [attempt("s-b", { score: 1 }), attempt("s-a", { score: 2 }), open("s-a", 2)]);
    expect(rows.map((row) => [row.studentId, row.name, row.attempts])).toEqual([
      ["s-a", "Removed student", 2],
      ["s-b", "Removed student", 1],
    ]);
  });

  it("names an enrolled student with an empty name", () => {
    expect(studentRows([{ id: "s-x", fullName: "" }], [])[0].name).toBe("Unknown student");
  });
});

describe("firstSubmittedAttempts", () => {
  it("picks the lowest submitted attempt number per student and skips open ones", () => {
    const first = attempt("s-abad", { attemptNo: 1, score: 2 });
    const retake = attempt("s-abad", { attemptNo: 2, score: 9 });
    const other = attempt("s-cruz", { attemptNo: 2, score: 5 });
    const picked = firstSubmittedAttempts([retake, first, open("s-cruz", 3), other, open("s-reyes")]);
    expect(picked.map((item) => item.id).sort()).toEqual([first.id, other.id].sort());
  });
});

describe("itemAnalysis", () => {
  it("numbers the questions by position and counts correct first attempts", () => {
    const abad = attempt("s-abad");
    const cruz = attempt("s-cruz");
    const reyes = attempt("s-reyes");
    const answers = [
      mark(abad.id, "q1", true),
      mark(abad.id, "q2", true),
      mark(cruz.id, "q1", true),
      mark(cruz.id, "q2", false),
      mark(reyes.id, "q1", false),
      mark(reyes.id, "q2", false),
    ];
    const items = itemAnalysis(questions, [abad, cruz, reyes], answers);
    expect(items.map((item) => [item.number, item.id, item.correct, item.total, item.percent])).toEqual([
      [1, "q1", 2, 3, 66],
      [2, "q2", 1, 3, 33],
    ]);
    expect(items[0]).toMatchObject({ kind: "mcq", prompt: "Pick the broker.", points: 2 });
  });

  it("does not let a retake inflate the percent", () => {
    const first = attempt("s-abad", { attemptNo: 1 });
    const retake = attempt("s-abad", { attemptNo: 2 });
    const third = attempt("s-abad", { attemptNo: 3 });
    const answers = [
      mark(first.id, "q1", false),
      mark(retake.id, "q1", true),
      mark(third.id, "q1", true),
      mark(first.id, "q2", true),
      mark(retake.id, "q2", false),
    ];
    const items = itemAnalysis(questions, [third, retake, first], answers);
    expect(items.map((item) => [item.id, item.correct, item.total, item.percent])).toEqual([
      ["q1", 0, 1, 0],
      ["q2", 1, 1, 100],
    ]);
  });

  it("counts a blank as wrong, with or without a stored row", () => {
    const abad = attempt("s-abad");
    const cruz = attempt("s-cruz");
    const answers = [mark(abad.id, "q1", true), mark(abad.id, "q2", false)];
    const items = itemAnalysis(questions, [abad, cruz], answers);
    expect(items.map((item) => [item.correct, item.total, item.percent])).toEqual([
      [1, 2, 50],
      [0, 2, 0],
    ]);
  });

  it("ignores open attempts and answers of attempts that do not count", () => {
    const abad = attempt("s-abad");
    const running = open("s-cruz");
    const answers = [mark(abad.id, "q1", true), mark(running.id, "q1", true), mark("attempt-other", "q1", true)];
    const [item] = itemAnalysis(questions, [abad, running], answers);
    expect([item.correct, item.total, item.percent]).toEqual([1, 1, 100]);
  });

  it("counts a repeated row once", () => {
    const abad = attempt("s-abad");
    const [item] = itemAnalysis(questions, [abad], [mark(abad.id, "q1", true), mark(abad.id, "q1", true)]);
    expect([item.correct, item.total]).toEqual([1, 1]);
  });

  it("gives null with zero submissions", () => {
    const items = itemAnalysis(questions, [open("s-abad")], []);
    expect(items.map((item) => [item.correct, item.total, item.percent])).toEqual([
      [0, 0, null],
      [0, 0, null],
    ]);
  });

  it("rounds the percent down", () => {
    const attempts = Array.from({ length: 12 }, (_, index) => attempt(`s-${index}`));
    const answers = attempts.slice(0, 7).map((item) => mark(item.id, "q1", true));
    const [item] = itemAnalysis(questions, attempts, answers);
    expect(item.percent).toBe(58);
    expect(itemSentence(item)).toBe("7 of 12 correct, 58%");
  });
});

describe("itemSentence", () => {
  it("says when nothing was submitted", () => {
    expect(itemSentence({ correct: 0, total: 0, percent: null })).toBe("No submissions yet");
  });

  it("keeps a real zero percent", () => {
    expect(itemSentence({ correct: 0, total: 4, percent: 0 })).toBe("0 of 4 correct, 0%");
  });
});

describe("summary", () => {
  it("counts each state and averages the best scores to one decimal", () => {
    const attempts = [
      attempt("s-abad", { attemptNo: 1, score: 4 }),
      attempt("s-abad", { attemptNo: 2, score: 9 }),
      attempt("s-cruz", { score: 6 }),
      attempt("s-gone", { score: 8 }),
      open("s-reyes"),
    ];
    const totals = summary(studentRows([...roster, { id: "s-idle", fullName: "Zed Idle" }], attempts));
    expect(totals).toEqual({ submitted: 3, inProgress: 1, notStarted: 1, average: 7.7, highest: 9, lowest: 6 });
    expect(countsLine(totals)).toBe("3 submitted · 1 in progress · 1 not started");
    expect(scoresLine(totals, 12)).toBe("Average 7.7 of 12 · Highest 9 · Lowest 6");
  });

  it("counts a student with a score and an open retake as submitted only", () => {
    const totals = summary(studentRows(roster.slice(0, 1), [attempt("s-cruz", { score: 5 }), open("s-cruz", 2)]));
    expect(totals).toMatchObject({ submitted: 1, inProgress: 0, notStarted: 0, average: 5 });
    expect(scoresLine(totals, 12)).toBe("Average 5.0 of 12 · Highest 5 · Lowest 5");
  });

  it("has no scores with zero submissions", () => {
    const totals = summary(studentRows(roster, [open("s-abad")]));
    expect(totals).toEqual({ submitted: 0, inProgress: 1, notStarted: 2, average: null, highest: null, lowest: null });
    expect(scoresLine(totals, 12)).toBeNull();
  });

  it("handles an empty class", () => {
    expect(summary([])).toEqual({ submitted: 0, inProgress: 0, notStarted: 0, average: null, highest: null, lowest: null });
  });
});
