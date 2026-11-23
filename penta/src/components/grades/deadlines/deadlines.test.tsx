import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";

const loadActivities = vi.fn();
const loadMyGrades = vi.fn();
const listStudentClasses = vi.fn();
const client = { name: "client" };

vi.mock("@/lib/supabase/server", () => ({ createClient: async () => client }));
vi.mock("@/lib/quiz", async (original) => ({
  ...(await original<typeof import("@/lib/quiz")>()),
  loadActivities: (...values: unknown[]) => loadActivities(...values),
}));
vi.mock("@/lib/grades", async (original) => ({
  ...(await original<typeof import("@/lib/grades")>()),
  loadMyGrades: (...values: unknown[]) => loadMyGrades(...values),
}));
vi.mock("@/lib/classes", async (original) => ({
  ...(await original<typeof import("@/lib/classes")>()),
  listStudentClasses: (...values: unknown[]) => listStudentClasses(...values),
}));

import { cellOn, quiz, upload } from "@/components/ops/list/fixtures";
import { Deadlines } from "../Deadlines";
import { DeadlinesView } from "./DeadlinesView";
import type { DeadlineGroups, DeadlineItem } from "./helpers";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.useRealTimers();
});

const now = Date.parse("2026-11-27T04:00:00.000Z");

function item(id: string, dueAt: string | null, overrides: Partial<DeadlineItem> = {}): DeadlineItem {
  return { id, title: `Activity ${id}`, kind: "Quiz", classCode: "INTE 301", dueAt, state: "none", ...overrides };
}

const groups: DeadlineGroups = {
  upcoming: [
    item("today", "2026-11-27T15:59:00.000Z", { title: "Message brokers" }),
    item("tomorrow", "2026-11-28T15:59:00.000Z", { title: "Chapter 3 draft", kind: "Upload", classCode: "COMP 015" }),
    item("later", "2026-12-04T15:59:00.000Z"),
  ],
  undated: [item("open", null, { title: "Reading notes" })],
  pastDue: [item("missed", "2026-11-26T15:59:00.000Z", { title: "Chapter 2", kind: "Upload", state: "missing" })],
};

const nothing: DeadlineGroups = { upcoming: [], undated: [], pastDue: [] };

describe("DeadlinesView", () => {
  it("names the section and counts what is left to do", () => {
    render(<DeadlinesView groups={groups} now={now} />);
    const section = within(screen.getByRole("region", { name: "My upcoming deadlines" }));
    expect(section.getByRole("heading", { level: 2 }).textContent).toBe("My upcoming deadlines");
    expect(section.getByText("4 to do")).toBeTruthy();
  });

  it("lists upcoming work with a link, the kind, the class code and the due text", () => {
    render(<DeadlinesView groups={groups} now={now} />);
    const rows = within(screen.getByRole("list", { name: "Upcoming" })).getAllByRole("listitem");
    expect(rows.map((row) => within(row).getByRole("link").getAttribute("href"))).toEqual([
      "/ops/today",
      "/ops/tomorrow",
      "/ops/later",
    ]);
    expect(rows[0].textContent).toBe("QuizINTE 301Message brokersDue today, 11:59 PM");
    expect(rows[1].textContent).toBe("UploadCOMP 015Chapter 3 draftDue tomorrow, 11:59 PM");
    expect(rows[2].textContent).toContain("Due Dec 4, 11:59 PM");
    expect(within(rows[0]).getByRole("link").textContent).toBe("Message brokers");
  });

  it("groups work with no due date after the dated work", () => {
    render(<DeadlinesView groups={groups} now={now} />);
    const undated = screen.getByRole("list", { name: "No due date" });
    expect(screen.getByRole("heading", { level: 3, name: "No due date" })).toBeTruthy();
    expect(within(undated).getByRole("listitem").textContent).toBe("QuizINTE 301Reading notesNo due date");
    const upcoming = screen.getByRole("list", { name: "Upcoming" });
    expect(upcoming.compareDocumentPosition(undated) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("lists past due work last with the word Missing", () => {
    render(<DeadlinesView groups={groups} now={now} />);
    const pastDue = screen.getByRole("list", { name: "Past due" });
    const row = within(pastDue).getByRole("listitem");
    expect(row.textContent).toBe("UploadINTE 301Chapter 2MissingWas due Nov 26, 11:59 PM");
    expect(row.querySelector("[data-status]")?.getAttribute("data-status")).toBe("due");
    expect(within(row).getByRole("link").getAttribute("href")).toBe("/ops/missed");
    const undated = screen.getByRole("list", { name: "No due date" });
    expect(undated.compareDocumentPosition(pastDue) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(within(screen.getByRole("list", { name: "Upcoming" })).queryByText("Missing")).toBeNull();
  });

  it("limits the list to ten and says how many more", () => {
    const upcoming = Array.from({ length: 14 }, (_, index) => item(`a${index}`, "2026-11-28T15:59:00.000Z"));
    render(<DeadlinesView groups={{ ...nothing, upcoming }} now={now} />);
    expect(screen.getAllByRole("listitem")).toHaveLength(10);
    expect(screen.getByText("and 4 more")).toBeTruthy();
    expect(screen.getByText("14 to do")).toBeTruthy();
  });

  it("says how many more once, under the last group shown", () => {
    const upcoming = Array.from({ length: 8 }, (_, index) => item(`a${index}`, "2026-11-28T15:59:00.000Z"));
    const undated = Array.from({ length: 6 }, (_, index) => item(`b${index}`, null));
    render(<DeadlinesView groups={{ upcoming, undated, pastDue: [] }} now={now} />);
    expect(screen.getAllByRole("listitem")).toHaveLength(10);
    expect(screen.getAllByText("and 4 more")).toHaveLength(1);
  });

  it("shows the empty state", () => {
    render(<DeadlinesView groups={nothing} now={now} />);
    expect(screen.getByText("Nothing due. You are all caught up.")).toBeTruthy();
    expect(screen.getByText("0 to do")).toBeTruthy();
    expect(screen.queryByRole("list")).toBeNull();
    expect(screen.queryByRole("heading", { level: 3 })).toBeNull();
  });

  it("does not say all caught up while work is missing", () => {
    render(<DeadlinesView groups={{ ...nothing, pastDue: groups.pastDue }} now={now} />);
    expect(screen.queryByText("Nothing due. You are all caught up.")).toBeNull();
    expect(screen.getByText("Nothing upcoming.")).toBeTruthy();
    expect(screen.getByRole("list", { name: "Past due" })).toBeTruthy();
  });

  it("renders a title with markup as text", () => {
    const risky = { ...nothing, upcoming: [item("x", null, { title: "<img src=x onerror=alert(1)>" })] };
    const { container } = render(<DeadlinesView groups={{ ...risky, undated: [] }} now={now} />);
    expect(container.querySelector("img")).toBeNull();
    expect(screen.getByText("<img src=x onerror=alert(1)>")).toBeTruthy();
  });
});

describe("Deadlines", () => {
  it("loads activities, grades and classes once each and lists what is due", async () => {
    vi.useFakeTimers({ now });
    loadActivities.mockResolvedValue([
      quiz("soon", { title: "Message brokers", dueAt: "2026-11-27T15:59:00.000Z" }),
      upload("missed", { title: "Chapter 2", dueAt: "2026-11-26T15:59:00.000Z" }),
      upload("handed", { title: "Chapter 1" }),
    ]);
    loadMyGrades.mockResolvedValue([cellOn("missed", { state: "missing" }), cellOn("handed", { state: "submitted" })]);
    listStudentClasses.mockResolvedValue([
      { id: "class-1", code: "INTE 301", title: "Architecture 1", section: "", term: "", teacherName: "Teacher" },
    ]);
    render(await Deadlines({ user: { id: "student-1", fullName: "Ana Reyes", role: "student" } }));
    expect(loadActivities).toHaveBeenCalledTimes(1);
    expect(loadMyGrades).toHaveBeenCalledTimes(1);
    expect(listStudentClasses).toHaveBeenCalledTimes(1);
    expect(listStudentClasses).toHaveBeenCalledWith(client, "student-1");
    expect(within(screen.getByRole("list", { name: "Upcoming" })).getByRole("listitem").textContent).toBe(
      "QuizINTE 301Message brokersDue today, 11:59 PM",
    );
    expect(within(screen.getByRole("list", { name: "Past due" })).getByRole("link").textContent).toBe("Chapter 2");
    expect(screen.queryByText("Chapter 1")).toBeNull();
  });
});
