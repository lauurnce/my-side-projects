import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import type { Activity, Attempt, ReviewItem, SubmittedReview } from "@/lib/quiz";
import { acceptedText, answerText, primaryAction, toSaveReply, type DeckGate } from "./helpers";
import { OverviewView, type OverviewViewProps } from "./OverviewView";
import { ResultView } from "./ResultView";

afterEach(cleanup);

const activityId = "7b0f6a52-1c1d-4f6e-9d55-0d6d3a1f2c11";
const classId = "9d8c7b6a-52a7-4b6c-8a44-6f0b0f0f9d66";
const now = Date.parse("2026-11-27T04:00:00.000Z");
const open: DeckGate = { state: "none" };

function activity(overrides: Partial<Activity> = {}): Activity {
  return {
    id: activityId,
    classId,
    lessonId: null,
    type: "quiz",
    title: "Integration quiz",
    instructionsMd: "",
    points: 5,
    dueAt: null,
    publishedAt: "2026-11-26T00:00:00.000Z",
    requiresDeckId: null,
    attemptLimit: 2,
    timeLimitMin: null,
    showAnswers: "never",
    ...overrides,
  };
}

function attempt(attemptNo: number, score: number | null, overrides: Partial<Attempt> = {}): Attempt {
  return {
    id: `a${attemptNo}`,
    activityId,
    studentId: "s1",
    attemptNo,
    startedAt: "2026-11-27T01:00:00.000Z",
    expiresAt: null,
    submittedAt: score === null ? null : `2026-11-27T0${attemptNo}:30:00.000Z`,
    score,
    maxScore: 5,
    ...overrides,
  };
}

const idle = async () => ({});

function overview(overrides: Partial<OverviewViewProps> = {}) {
  return <OverviewView activity={activity()} attempts={[]} gate={open} now={now} action={idle} {...overrides} />;
}

describe("OverviewView", () => {
  it("shows the header, the facts and the start button", () => {
    const { container } = render(overview());

    expect(screen.getAllByRole("heading", { level: 1 }).map((heading) => heading.textContent)).toEqual(["Integration quiz"]);
    expect(screen.getByRole("link", { name: "Back to class" }).getAttribute("href")).toBe(`/classes/${classId}`);
    expect(screen.getByText("Layer 03 · Ops")).toBeTruthy();
    expect(screen.getByText("Points: 5")).toBeTruthy();
    expect(screen.getByText("No due date")).toBeTruthy();
    expect(screen.getByText("No time limit")).toBeTruthy();
    expect(screen.getByText("Attempts: 0 of 2 used")).toBeTruthy();
    expect(screen.queryByText(/closes at the due time/)).toBeNull();

    const start = screen.getByRole("button", { name: "Start quiz" });
    expect(start.getAttribute("type")).toBe("submit");
    expect(container.querySelector<HTMLInputElement>('input[name="activityId"]')?.value).toBe(activityId);
    expect(screen.queryByRole("button", { name: "Continue quiz" })).toBeNull();
  });

  it("shows the due time, the time limit and the closing line", () => {
    render(overview({ activity: activity({ dueAt: "2026-11-30T09:00:00.000Z", timeLimitMin: 20 }) }));

    expect(screen.getByText("Due: Nov 30, 2026, 5:00 PM, Manila time")).toBeTruthy();
    expect(screen.getByText("Time limit: 20 minutes")).toBeTruthy();
    expect(screen.getByText("The quiz closes at the due time even if your timer has not run out.")).toBeTruthy();
  });

  it("renders the instructions as markdown", () => {
    render(overview({ activity: activity({ instructionsMd: "Read **each** question." }) }));

    expect(screen.getByText("each").tagName).toBe("STRONG");
  });

  it("offers to continue an open attempt", () => {
    render(overview({ attempts: [attempt(1, 3), attempt(2, null)] }));

    expect(screen.getByRole("button", { name: "Continue quiz" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Start quiz" })).toBeNull();
    expect(screen.getByText("Attempts: 2 of 2 used")).toBeTruthy();
    expect(screen.getByText("Attempt 2: in progress")).toBeTruthy();
  });

  it("says the quiz is closed after the due time", () => {
    render(overview({ activity: activity({ dueAt: "2026-11-27T03:00:00.000Z" }) }));

    expect(screen.getByText("This quiz is closed. The due time has passed.")).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("says when no attempts are left", () => {
    render(overview({ attempts: [attempt(1, 3), attempt(2, 4)] }));

    expect(screen.getByText("You have no attempts left.")).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("shows the unlock card and no start button while the deck is not finished", () => {
    const gate: DeckGate = { state: "locked", viewed: 3, total: 12, href: "/decks/d1" };
    render(overview({ gate }));

    const card = screen.getByRole("link", { name: /Finish this deck to unlock/ });
    expect(card.getAttribute("href")).toBe("/decks/d1");
    expect(within(card).getByText("Integration quiz")).toBeTruthy();
    expect(within(card).getByText(/Viewed 3 \/ 12/)).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("says so when the required deck cannot be read", () => {
    render(overview({ gate: { state: "unreadable" } }));

    expect(screen.getByText("A deck must be finished first. It is not available yet.")).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("lists past attempts and marks the best one", () => {
    render(overview({ activity: activity({ attemptLimit: 3 }), attempts: [attempt(1, 4), attempt(2, 2)] }));

    const lines = screen.getAllByRole("listitem").filter((line) => /^Attempt \d/.test(line.textContent ?? ""));
    expect(lines).toHaveLength(2);
    expect(within(lines[0]).getByText("Attempt 1: 4 of 5 (80%)")).toBeTruthy();
    expect(within(lines[0]).getByText("Best")).toBeTruthy();
    expect(within(lines[0]).getByText("Submitted Nov 27, 2026, 9:30 AM, Manila time")).toBeTruthy();
    expect(within(lines[0]).getByRole("link", { name: "See attempt 1" }).getAttribute("href")).toBe(
      `/ops/${activityId}/attempt/a1`,
    );
    expect(within(lines[1]).getByText("Attempt 2: 2 of 5 (40%)")).toBeTruthy();
    expect(within(lines[1]).queryByText("Best")).toBeNull();
    expect(screen.getByRole("button", { name: "Start quiz" })).toBeTruthy();
  });
});

describe("primaryAction", () => {
  it("picks the action by state", () => {
    const locked: DeckGate = { state: "locked", viewed: 0, total: 3, href: "/decks/d1" };

    expect(primaryAction(activity(), [], open, now)).toBe("start");
    expect(primaryAction(activity({ publishedAt: null }), [], open, now)).toBe("unavailable");
    expect(primaryAction(activity(), [attempt(1, null)], locked, now)).toBe("continue");
    expect(primaryAction(activity({ dueAt: "2026-11-27T03:59:59.000Z" }), [attempt(1, 2)], open, now)).toBe("closed");
    expect(primaryAction(activity({ attemptLimit: 1 }), [attempt(1, 2)], open, now)).toBe("no_attempts");
    expect(primaryAction(activity(), [attempt(1, 2)], locked, now)).toBe("locked");
  });
});

const items: ReviewItem[] = [
  { id: "q1", kind: "mcq", prompt: "Which part routes messages?", options: ["Queue", "Broker"], points: 2, position: 1, answer: 1 },
  { id: "q2", kind: "tf", prompt: "A queue keeps order.", options: null, points: 1, position: 2, answer: false },
  { id: "q3", kind: "ident", prompt: "Name the pattern.", options: null, points: 1, position: 3, answer: "pubsub" },
  { id: "q4", kind: "ident", prompt: "Name the protocol.", options: null, points: 1, position: 4, answer: null },
];

const keys = [
  { isCorrect: true, accepted: 1 },
  { isCorrect: false, accepted: true },
  { isCorrect: false, accepted: ["publish subscribe", "pub/sub"] },
  { isCorrect: false, accepted: ["amqp"] },
];

function review(reveal: boolean): SubmittedReview {
  return {
    status: "submitted",
    activityId,
    attemptNo: 1,
    score: 4,
    maxScore: 5,
    submittedAt: "2026-11-27T02:30:00.000Z",
    reveal,
    items: reveal ? items.map((item, index) => ({ ...item, ...keys[index] }) as ReviewItem) : items,
  };
}

describe("ResultView", () => {
  it("shows the score at once with the percent, the attempt and the time", () => {
    render(<ResultView activity={activity()} review={review(false)} canRetry={false} />);

    const headings = screen.getAllByRole("heading", { level: 1 });
    expect(headings).toHaveLength(1);
    expect(headings[0].textContent).toBe("You scored 4 of 5");
    expect(screen.getByText("80%")).toBeTruthy();
    expect(screen.getByText("Attempt 1")).toBeTruthy();
    expect(screen.getByText("Submitted Nov 27, 2026, 10:30 AM, Manila time")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Back to quiz overview" }).getAttribute("href")).toBe(`/ops/${activityId}`);
  });

  it("shows the answers given as text", () => {
    render(<ResultView activity={activity()} review={review(false)} canRetry={false} />);

    expect(screen.getByText("Question 1 (2 points)")).toBeTruthy();
    expect(screen.getByText("Your answer: B. Broker")).toBeTruthy();
    expect(screen.getByText("Your answer: False")).toBeTruthy();
    expect(screen.getByText("Your answer: pubsub")).toBeTruthy();
    expect(screen.getByText("No answer")).toBeTruthy();
  });

  it("shows no mark and no accepted answer when answers are hidden", () => {
    const leaky = { ...review(false), items: items.map((item, index) => ({ ...item, ...keys[index] }) as ReviewItem) };
    const { container } = render(<ResultView activity={activity()} review={leaky} canRetry={false} />);
    const text = container.textContent ?? "";

    expect(text).not.toMatch(/Correct|Incorrect/i);
    expect(text).not.toContain("publish subscribe");
    expect(text).not.toContain("amqp");
    expect(container.innerHTML).not.toContain("pub/sub");
    expect(screen.getByText("Your teacher has chosen not to show the answers.")).toBeTruthy();
  });

  it("says when the answers will be shown", () => {
    const later = activity({ showAnswers: "after_due", dueAt: "2026-11-30T09:00:00.000Z" });
    render(<ResultView activity={later} review={review(false)} canRetry />);

    expect(screen.getByText("Answers are shown after the due time (Nov 30, 2026, 5:00 PM, Manila time).")).toBeTruthy();
    expect(screen.getByText("You can try again. Start another attempt from the quiz overview.")).toBeTruthy();
  });

  it("shows a word and the accepted answer per question when revealed", () => {
    render(<ResultView activity={activity({ showAnswers: "after_submit" })} review={review(true)} canRetry={false} />);

    const lines = screen.getAllByRole("listitem");
    expect(within(lines[0]).getByText("Correct")).toBeTruthy();
    expect(within(lines[0]).getByText("Correct answer: B. Broker")).toBeTruthy();
    expect(within(lines[1]).getByText("Incorrect")).toBeTruthy();
    expect(within(lines[1]).getByText("Correct answer: True")).toBeTruthy();
    expect(within(lines[2]).getByText("Incorrect")).toBeTruthy();
    expect(within(lines[2]).getByText("Correct answer: publish subscribe, pub/sub")).toBeTruthy();
    expect(within(lines[3]).getByText("No answer")).toBeTruthy();
    expect(within(lines[3]).getByText("Correct answer: amqp")).toBeTruthy();
    expect(screen.queryByText(/chosen not to show/)).toBeNull();
    expect(screen.queryByText(/try again/)).toBeNull();
  });
});

describe("answer text", () => {
  it("words each kind", () => {
    expect(answerText({ kind: "mcq", options: ["Queue", "Broker"] }, 0)).toBe("A. Queue");
    expect(answerText({ kind: "mcq", options: ["Queue", "Broker"] }, 7)).toBeNull();
    expect(answerText({ kind: "tf", options: null }, true)).toBe("True");
    expect(answerText({ kind: "ident", options: null }, "")).toBeNull();
    expect(answerText({ kind: "ident", options: null }, null)).toBeNull();
    expect(acceptedText({ kind: "tf", options: null }, false)).toBe("False");
    expect(acceptedText({ kind: "ident", options: null }, undefined)).toBeNull();
  });
});

describe("toSaveReply", () => {
  it("reads a reply and treats anything else as failed", () => {
    expect(toSaveReply({ status: "saved", expires_at: "2026-11-27T04:20:00Z", now: "2026-11-27T04:00:00Z" })).toEqual({
      outcome: "saved",
      expiresAt: "2026-11-27T04:20:00Z",
      now: "2026-11-27T04:00:00Z",
    });
    expect(toSaveReply({ status: "late", expires_at: null })).toEqual({ outcome: "late", expiresAt: null, now: null });
    expect(toSaveReply({ status: "weird" }).outcome).toBe("failed");
    expect(toSaveReply(null).outcome).toBe("failed");
  });
});
