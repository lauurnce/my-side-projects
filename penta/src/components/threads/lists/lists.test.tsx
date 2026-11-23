import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import type { ThreadFormState } from "@/app/threads/schema";
import type { ThreadSummary } from "@/lib/threads";
import { ClassThreads } from "../ClassThreads";
import { QuestionsSection } from "../QuestionsSection";
import { hiddenCountLabel, moreLabel, newestFirst, questionCountLabel, replyCountLabel } from "./helpers";

const loaded = vi.hoisted(() => ({ threads: [] as unknown[], calls: [] as string[] }));
const actions = vi.hoisted(() => ({ askQuestion: vi.fn() }));

vi.mock("@/app/threads/actions", () => actions);
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({}) }));
vi.mock("@/lib/threads", async (importActual) => ({
  ...(await importActual<typeof import("@/lib/threads")>()),
  loadClassThreads: async (_supabase: unknown, classId: string) => {
    loaded.calls.push(classId);
    return loaded.threads;
  },
}));

const classId = "3f2b8c1e-6a4d-4e5f-9b7a-1c2d3e4f5a6b";
const lessonId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const activityId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const student = { id: "u1", fullName: "Ana Reyes", role: "student" as const };
const teacher = { id: "u2", fullName: "Sir Dela Cruz", role: "teacher" as const };

function summary(id: string, overrides: Partial<ThreadSummary> = {}): ThreadSummary {
  return {
    id,
    lessonId,
    activityId: null,
    targetTitle: "Message queues",
    title: `Question ${id}`,
    authorName: "Ana Reyes",
    authorRole: "student",
    createdAt: "2026-11-27T02:00:00Z",
    locked: false,
    replies: 0,
    lastPostAt: null,
    hiddenPosts: 0,
    questionHidden: false,
    ...overrides,
  };
}

async function showQuestions(threads: ThreadSummary[], target = { lessonId } as { lessonId: string } | { activityId: string }) {
  loaded.threads = threads;
  return render(await QuestionsSection({ user: student, classId, target }));
}

async function showClass(threads: ThreadSummary[], user = student as typeof student | typeof teacher) {
  loaded.threads = threads;
  return render(await ClassThreads({ user, classId }));
}

function row(title: string) {
  return screen.getByRole("link", { name: title }).closest("li") as HTMLElement;
}

beforeEach(() => {
  loaded.calls = [];
  actions.askQuestion.mockReset().mockResolvedValue({} satisfies ThreadFormState);
});

afterEach(cleanup);

describe("list wording", () => {
  it("words the reply count", () => {
    expect(replyCountLabel(0)).toBe("No replies yet");
    expect(replyCountLabel(1)).toBe("1 reply");
    expect(replyCountLabel(3)).toBe("3 replies");
  });

  it("words the question count, the hidden count and the rest", () => {
    expect(questionCountLabel(0)).toBe("0 questions");
    expect(questionCountLabel(1)).toBe("1 question");
    expect(hiddenCountLabel(0)).toBeNull();
    expect(hiddenCountLabel(2)).toBe("2 hidden");
    expect(moreLabel(20)).toBeNull();
    expect(moreLabel(32)).toBe("and 12 more");
  });

  it("orders by the last activity, falling back to when the question was asked", () => {
    const ordered = newestFirst([
      summary("old", { createdAt: "2026-11-25T02:00:00Z" }),
      summary("fresh", { createdAt: "2026-11-27T02:00:00Z" }),
      summary("revived", { createdAt: "2026-11-20T02:00:00Z", lastPostAt: "2026-11-27T05:00:00Z" }),
    ]);
    expect(ordered.map((thread) => thread.id)).toEqual(["revived", "fresh", "old"]);
  });
});

describe("QuestionsSection", () => {
  it("lists only the questions of this lesson, loading the class once", async () => {
    await showQuestions([
      summary("one", { replies: 3, lastPostAt: "2026-11-27T04:30:00Z" }),
      summary("two", { replies: 1 }),
      summary("three"),
      summary("elsewhere", { lessonId: null, activityId }),
    ]);
    expect(loaded.calls).toEqual([classId]);
    expect(screen.getByRole("heading", { level: 2, name: "Questions" })).toBeTruthy();
    expect(screen.getByText("3 questions")).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Question elsewhere" })).toBeNull();
    expect(screen.getByRole("link", { name: "Question one" }).getAttribute("href")).toBe("/threads/one");
    expect(within(row("Question one")).getByText("3 replies")).toBeTruthy();
    expect(within(row("Question one")).getByText("Nov 27, 12:30 PM")).toBeTruthy();
    expect(within(row("Question two")).getByText("1 reply")).toBeTruthy();
    expect(within(row("Question three")).getByText("No replies yet")).toBeTruthy();
    expect(within(row("Question three")).getByText("Nov 27, 10:00 AM")).toBeTruthy();
    expect(row("Question one").textContent).toContain("by Ana Reyes");
    expect(row("Question one").textContent).not.toContain("on Message queues");
  });

  it("lists the questions of an activity", async () => {
    await showQuestions([summary("one"), summary("quiz", { lessonId: null, activityId })], { activityId });
    expect(screen.getByText("1 question")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Question quiz" })).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Question one" })).toBeNull();
  });

  it("labels the teacher from the role, shows a locked chip and no teacher-only counts for a student", async () => {
    const { container } = await showQuestions([
      summary("named", { authorName: "Teacher" }),
      summary("staff", { authorName: "Sir Dela Cruz", authorRole: "teacher", locked: true }),
    ]);
    expect(row("Question named").querySelector("[data-role-label]")).toBeNull();
    expect(row("Question staff").querySelector("[data-role-label]")?.textContent).toBe("Teacher");
    expect(within(row("Question staff")).getByText("Locked")).toBeTruthy();
    expect(within(row("Question named")).queryByText("Locked")).toBeNull();
    expect(container.textContent).not.toContain("hidden");
  });

  it("shows the teacher the hidden counts", async () => {
    await showQuestions([summary("flagged", { hiddenPosts: 2, questionHidden: true }), summary("clean")]);
    expect(within(row("Question flagged")).getByText("2 hidden")).toBeTruthy();
    expect(within(row("Question flagged")).getByText("Question hidden from students")).toBeTruthy();
    expect(row("Question clean").textContent).not.toContain("hidden");
  });

  it("shows a title with markup as text", async () => {
    const { container } = await showQuestions([summary("x", { title: "<img src=x onerror=alert(1)> **bold**" })]);
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("strong")).toBeNull();
    expect(screen.getByRole("link", { name: "<img src=x onerror=alert(1)> **bold**" })).toBeTruthy();
  });

  it("has an empty state and still offers the form", async () => {
    await showQuestions([summary("elsewhere", { lessonId: null, activityId })]);
    expect(screen.getByText("No questions yet. Ask the first one.")).toBeTruthy();
    expect(screen.getByText("0 questions")).toBeTruthy();
    expect(screen.queryByRole("list")).toBeNull();
    expect(screen.getByRole("button", { name: "Ask a question" })).toBeTruthy();
  });

  it("reveals the ask form and sends the class and the lesson", async () => {
    await showQuestions([]);
    const title = screen.getByLabelText("Question title") as HTMLInputElement;
    const form = title.closest("form")!;
    expect(form.hidden).toBe(true);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Ask a question" }));
    });
    expect(form.hidden).toBe(false);
    expect(screen.getByRole("button", { name: "Ask a question" }).getAttribute("aria-expanded")).toBe("true");

    fireEvent.change(title, { target: { value: "Why queues?" } });
    fireEvent.change(screen.getByLabelText("Your question"), { target: { value: "I do not get it." } });
    expect(screen.getByText("16 of 2,000 characters")).toBeTruthy();
    await act(async () => {
      fireEvent.submit(form);
    });
    const formData = actions.askQuestion.mock.calls[0][1] as FormData;
    expect(Object.fromEntries(formData.entries())).toEqual({
      classId,
      lessonId,
      title: "Why queues?",
      body: "I do not get it.",
    });
  });

  it("sends the activity for an activity page", async () => {
    await showQuestions([], { activityId });
    const form = screen.getByLabelText("Question title").closest("form")!;
    await act(async () => {
      fireEvent.submit(form);
    });
    const formData = actions.askQuestion.mock.calls[0][1] as FormData;
    expect(formData.get("activityId")).toBe(activityId);
    expect(formData.has("lessonId")).toBe(false);
  });

  it("keeps the typed question and marks the field when it is refused", async () => {
    const message = "Give your question a title of 160 characters or fewer.";
    actions.askQuestion.mockResolvedValue({
      tone: "alert",
      message,
      field: "title",
      values: { title: "Too long", body: "Kept text" },
    } satisfies ThreadFormState);
    await showQuestions([]);
    const body = screen.getByLabelText("Your question") as HTMLTextAreaElement;
    fireEvent.change(body, { target: { value: "Kept text" } });
    await act(async () => {
      fireEvent.submit(body.closest("form")!);
    });
    const title = screen.getByLabelText("Question title") as HTMLInputElement;
    const alert = screen.getByRole("alert");
    expect(alert.textContent).toBe(message);
    expect(title.getAttribute("aria-invalid")).toBe("true");
    expect(title.getAttribute("aria-describedby")).toContain(alert.id);
    expect(title.defaultValue).toBe("Too long");
    expect(body.value).toBe("Kept text");
    expect(body.hasAttribute("aria-invalid")).toBe(false);
  });
});

describe("ClassThreads", () => {
  it("lists every thread with where it belongs, newest activity first", async () => {
    const { container } = await showClass([
      summary("older", { createdAt: "2026-11-25T02:00:00Z" }),
      summary("quiz", { lessonId: null, activityId, targetTitle: "Quiz 1", lastPostAt: "2026-11-27T06:00:00Z" }),
    ]);
    expect(screen.getByRole("heading", { level: 2, name: "Questions in this class" })).toBeTruthy();
    expect(screen.getByText("2 questions")).toBeTruthy();
    const titles = [...container.querySelectorAll("li a")].map((link) => link.textContent);
    expect(titles).toEqual(["Question quiz", "Question older"]);
    expect(row("Question quiz").textContent).toContain("on Quiz 1");
    expect(row("Question older").textContent).toContain("on Message queues");
    expect(screen.queryByRole("button", { name: "Ask a question" })).toBeNull();
  });

  it("shows 20 at most and counts the rest in words", async () => {
    const many = Array.from({ length: 32 }, (_, index) => summary(`n${index}`));
    await showClass(many, teacher);
    expect(screen.getAllByRole("listitem")).toHaveLength(20);
    expect(screen.getByText("and 12 more")).toBeTruthy();
    expect(screen.getByText("32 questions")).toBeTruthy();
  });

  it("says nothing about more when everything fits", async () => {
    await showClass(Array.from({ length: 20 }, (_, index) => summary(`n${index}`)));
    expect(screen.queryByText(/^and \d+ more$/)).toBeNull();
  });

  it("has an empty state", async () => {
    await showClass([]);
    expect(screen.getByText("No questions in this class yet. Ask one from a lesson or an activity.")).toBeTruthy();
    expect(screen.queryByRole("list")).toBeNull();
  });
});
