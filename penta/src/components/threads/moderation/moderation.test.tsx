import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { HistoryEvent, ModerationState } from "@/app/threads/moderation-schema";
import type { ThreadInfo, ThreadPost } from "@/lib/threads";

const mocks = vi.hoisted(() => ({
  setPostHidden: vi.fn(),
  setThreadLocked: vi.fn(),
  loadPostHistory: vi.fn(),
}));

vi.mock("@/app/threads/moderation-actions", () => mocks);
vi.mock("next/navigation", () => ({ useParams: () => ({ id: "22222222-2222-4222-8222-222222222222" }) }));

import { PostModeration } from "../PostModeration";
import { ThreadModeration } from "../ThreadModeration";
import { editCountLabel, hideLabel, historyLabel, historyLead, lockWord } from "./labels";

const threadId = "22222222-2222-4222-8222-222222222222";

const answer: ThreadPost = {
  id: "11111111-1111-4111-8111-111111111111",
  parentId: null,
  isQuestion: false,
  authorName: "Ana Reyes",
  authorRole: "student",
  mine: false,
  canEdit: false,
  body: "Use a queue.",
  createdAt: "2026-11-27T14:00:00Z",
  editedAt: null,
  hidden: false,
  authorId: "33333333-3333-4333-8333-333333333333",
  authorInClass: true,
  editCount: 0,
};

const question: ThreadPost = { ...answer, isQuestion: true };

const thread: ThreadInfo = {
  id: threadId,
  classId: "44444444-4444-4444-8444-444444444444",
  lessonId: "55555555-5555-4555-8555-555555555555",
  activityId: null,
  targetTitle: "Message brokers",
  title: "Why a queue?",
  locked: false,
  canModerate: true,
};

const hiddenState: ModerationState = { tone: "status", message: "Hidden from students" };
const missingState: ModerationState = { tone: "alert", message: "That post is not available." };

function sentFields(call: unknown[]): Record<string, unknown> {
  return Object.fromEntries((call[1] as FormData).entries());
}

function button(name: string | RegExp) {
  return screen.getByRole("button", { name }) as HTMLButtonElement;
}

beforeEach(() => {
  mocks.setPostHidden.mockReset().mockResolvedValue(hiddenState);
  mocks.setThreadLocked.mockReset().mockResolvedValue({ tone: "status", message: "Thread locked. Nobody can post or edit." });
  mocks.loadPostHistory.mockReset().mockResolvedValue([]);
});

afterEach(cleanup);

describe("moderation labels", () => {
  it("names the post each button acts on and starts with the visible word", () => {
    expect(hideLabel("Ana Reyes", false)).toBe("Hide post by Ana Reyes");
    expect(hideLabel("Ana Reyes", true)).toBe("Unhide post by Ana Reyes");
    expect(hideLabel("  ", false)).toBe("Hide this post");
    expect(historyLabel("Ana Reyes")).toBe("History of post by Ana Reyes");
  });

  it("writes the edit count, the lock word and the history leads as words", () => {
    expect([editCountLabel(0), editCountLabel(1), editCountLabel(2)]).toEqual(["", "Edited 1 time", "Edited 2 times"]);
    expect([lockWord(false), lockWord(true)]).toEqual(["Lock thread", "Unlock thread"]);
    expect([historyLead("edit"), historyLead("hide"), historyLead("unhide")]).toEqual([
      "Edited by",
      "Hidden by",
      "Shown again by",
    ]);
  });
});

describe("PostModeration", () => {
  it("offers Hide for a shown post, named after its author", () => {
    render(<PostModeration post={answer} onChanged={() => {}} />);
    const hide = button("Hide post by Ana Reyes");
    expect(hide.textContent).toBe("Hide");
    expect(hide.type).toBe("submit");
    expect(screen.getAllByRole("button", { name: /^Hide/ })).toHaveLength(1);
    expect(screen.queryByRole("button", { name: /^Unhide/ })).toBeNull();
  });

  it("offers Unhide for a hidden post", () => {
    render(<PostModeration post={{ ...answer, hidden: true }} onChanged={() => {}} />);
    expect(button("Unhide post by Ana Reyes").textContent).toBe("Unhide");
    expect(screen.queryByRole("button", { name: /^Hide/ })).toBeNull();
  });

  it("sends the post, the thread and the hide flag, then reports and calls onChanged once", async () => {
    const onChanged = vi.fn();
    const view = render(<PostModeration post={answer} onChanged={onChanged} />);
    fireEvent.click(button(/^Hide/));
    expect((await screen.findByRole("status")).textContent).toBe("Hidden from students");
    expect(mocks.setPostHidden).toHaveBeenCalledTimes(1);
    expect(sentFields(mocks.setPostHidden.mock.calls[0])).toEqual({ postId: answer.id, threadId, hide: "true" });
    await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1));

    view.rerender(<PostModeration post={{ ...answer, hidden: true }} onChanged={() => onChanged()} />);
    view.rerender(<PostModeration post={{ ...answer, hidden: true }} onChanged={() => onChanged()} />);
    expect(onChanged).toHaveBeenCalledTimes(1);
    expect(button(/^Unhide/)).toBeTruthy();
  });

  it("sends hide false when the post is hidden", async () => {
    mocks.setPostHidden.mockResolvedValue({ tone: "status", message: "Shown to students again" });
    render(<PostModeration post={{ ...answer, hidden: true }} onChanged={() => {}} />);
    fireEvent.click(button(/^Unhide/));
    await waitFor(() => expect(screen.getByRole("status").textContent).toBe("Shown to students again"));
    expect(sentFields(mocks.setPostHidden.mock.calls[0]).hide).toBe("false");
  });

  it("does not call onChanged when the change is refused", async () => {
    mocks.setPostHidden.mockResolvedValue(missingState);
    const onChanged = vi.fn();
    render(<PostModeration post={answer} onChanged={onChanged} />);
    fireEvent.click(button(/^Hide/));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toBe("That post is not available."));
    expect(screen.getByRole("status").textContent).toBe("");
    expect(onChanged).not.toHaveBeenCalled();
  });

  it("asks before hiding the question and hides only on the confirm button", async () => {
    const onChanged = vi.fn();
    render(<PostModeration post={question} onChanged={onChanged} />);
    fireEvent.click(button(/^Hide/));
    expect(screen.getByText("Hiding the question hides the whole thread from students.")).toBeTruthy();
    expect(mocks.setPostHidden).not.toHaveBeenCalled();
    expect(screen.getAllByRole("button", { name: /^Hide/ })).toHaveLength(1);
    expect(document.activeElement).toBe(button("Hide the thread"));

    fireEvent.click(button("Hide the thread"));
    expect((await screen.findByRole("status")).textContent).toBe("Hidden from students");
    expect(mocks.setPostHidden).toHaveBeenCalledTimes(1);
    expect(sentFields(mocks.setPostHidden.mock.calls[0])).toEqual({ postId: question.id, threadId, hide: "true" });
    await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1));
    expect(screen.queryByText("Hiding the question hides the whole thread from students.")).toBeNull();
  });

  it("cancels the question step without calling the action and returns focus", () => {
    render(<PostModeration post={question} onChanged={() => {}} />);
    fireEvent.click(button(/^Hide/));
    fireEvent.click(button("Cancel"));
    expect(screen.queryByText("Hiding the question hides the whole thread from students.")).toBeNull();
    expect(mocks.setPostHidden).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(button("Hide post by Ana Reyes"));
  });

  it("does not ask before unhiding the question", async () => {
    render(<PostModeration post={{ ...question, hidden: true }} onChanged={() => {}} />);
    fireEvent.click(button(/^Unhide/));
    await waitFor(() => expect(mocks.setPostHidden).toHaveBeenCalledTimes(1));
    expect(screen.queryByText("Hiding the question hides the whole thread from students.")).toBeNull();
  });

  it("shows the edit count as text and no history for an untouched post", () => {
    const view = render(<PostModeration post={answer} onChanged={() => {}} />);
    expect(screen.queryByRole("button", { name: /^History/ })).toBeNull();
    expect(screen.queryByText(/^Edited/)).toBeNull();
    view.rerender(<PostModeration post={{ ...answer, editCount: 2 }} onChanged={() => {}} />);
    expect(screen.getByText("Edited 2 times")).toBeTruthy();
    expect(button(/^History/).getAttribute("aria-expanded")).toBe("false");
  });

  it("offers the history for a hidden post with no edits", () => {
    render(<PostModeration post={{ ...answer, hidden: true }} onChanged={() => {}} />);
    expect(button("History of post by Ana Reyes").textContent).toBe("History");
  });
});

describe("post history", () => {
  const attack = "<script>alert(1)</script>\n**bold** [link](https://example.com) <img src=x onerror=alert(1)>";
  const events: HistoryEvent[] = [
    { kind: "edit", oldBody: attack, actorName: "Ana Reyes", happenedAt: "Nov 27, 2026, 10:42 PM, Manila time" },
    { kind: "hide", oldBody: "", actorName: "Maria Santos", happenedAt: "Nov 27, 2026, 10:50 PM, Manila time" },
    { kind: "unhide", oldBody: "", actorName: "Deleted account", happenedAt: "Nov 27, 2026, 10:55 PM, Manila time" },
  ];
  const edited = { ...answer, editCount: 1 };

  it("does not load until it is opened, then loads once", async () => {
    mocks.loadPostHistory.mockResolvedValue(events);
    const view = render(<PostModeration post={edited} onChanged={() => {}} />);
    expect(mocks.loadPostHistory).not.toHaveBeenCalled();

    fireEvent.click(button(/^History/));
    expect(button(/^History/).getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByText("Loading the history.")).toBeTruthy();
    expect(await screen.findByText(/^Edited by/)).toBeTruthy();
    expect(mocks.loadPostHistory).toHaveBeenCalledTimes(1);
    expect(mocks.loadPostHistory).toHaveBeenCalledWith(edited.id);

    fireEvent.click(button(/^History/));
    expect(button(/^History/).getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(button(/^History/));
    view.rerender(<PostModeration post={{ ...edited }} onChanged={() => {}} />);
    expect(await screen.findByText(/^Edited by/)).toBeTruthy();
    expect(mocks.loadPostHistory).toHaveBeenCalledTimes(1);
  });

  it("writes each event as a sentence", async () => {
    mocks.loadPostHistory.mockResolvedValue(events);
    render(<PostModeration post={edited} onChanged={() => {}} />);
    fireEvent.click(button(/^History/));
    await screen.findByText(/^Edited by/);
    const lines = screen.getAllByRole("listitem").map((item) => item.querySelector("p")!.textContent);
    expect(lines).toEqual([
      "Edited by Ana Reyes, Nov 27, 2026, 10:42 PM, Manila time. Earlier text:",
      "Hidden by Maria Santos, Nov 27, 2026, 10:50 PM, Manila time.",
      "Shown again by Deleted account, Nov 27, 2026, 10:55 PM, Manila time.",
    ]);
  });

  it("shows the earlier text literally and creates no element from it", async () => {
    mocks.loadPostHistory.mockResolvedValue(events);
    const view = render(<PostModeration post={edited} onChanged={() => {}} />);
    fireEvent.click(button(/^History/));
    await screen.findByText(/^Edited by/);
    const old = view.container.querySelector("li p + p")!;
    expect(old.textContent).toBe(attack);
    expect(old.children).toHaveLength(0);
    expect(view.container.querySelector("script, img, a, strong")).toBeNull();
  });

  it("says so when there is nothing recorded", async () => {
    render(<PostModeration post={edited} onChanged={() => {}} />);
    fireEvent.click(button(/^History/));
    expect(await screen.findByText("No changes are recorded for this post.")).toBeTruthy();
    expect(screen.queryByRole("listitem")).toBeNull();
  });

  it("loads again when the post has changed since the last load", async () => {
    const view = render(<PostModeration post={edited} onChanged={() => {}} />);
    fireEvent.click(button(/^History/));
    await screen.findByText("No changes are recorded for this post.");
    mocks.loadPostHistory.mockResolvedValue(events);
    view.rerender(<PostModeration post={{ ...edited, editCount: 2 }} onChanged={() => {}} />);
    expect(await screen.findByText(/^Edited by/)).toBeTruthy();
    expect(mocks.loadPostHistory).toHaveBeenCalledTimes(2);
  });

  it("says so when loading fails and tries again on the next open", async () => {
    mocks.loadPostHistory.mockRejectedValueOnce(new Error("offline"));
    render(<PostModeration post={edited} onChanged={() => {}} />);
    fireEvent.click(button(/^History/));
    expect(await screen.findByText("The history could not be loaded. Close it, then open it again.")).toBeTruthy();
    fireEvent.click(button(/^History/));
    fireEvent.click(button(/^History/));
    expect(await screen.findByText("No changes are recorded for this post.")).toBeTruthy();
    expect(mocks.loadPostHistory).toHaveBeenCalledTimes(2);
  });
});

describe("ThreadModeration", () => {
  it("offers Lock thread with its help when the thread is open", () => {
    render(<ThreadModeration thread={thread} onChanged={() => {}} />);
    expect(button("Lock thread").type).toBe("submit");
    expect(screen.queryByRole("button", { name: "Unlock thread" })).toBeNull();
    expect(screen.getByText("A locked thread stays readable. Nobody can post or edit until you unlock it.")).toBeTruthy();
    expect(screen.getByText("You can hide any post. Hidden posts are not sent to students.")).toBeTruthy();
  });

  it("offers Unlock thread when the thread is locked", () => {
    render(<ThreadModeration thread={{ ...thread, locked: true }} onChanged={() => {}} />);
    expect(button("Unlock thread")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Lock thread" })).toBeNull();
  });

  it("sends the thread and the lock flag, then reports and calls onChanged", async () => {
    const onChanged = vi.fn();
    render(<ThreadModeration thread={thread} onChanged={onChanged} />);
    fireEvent.click(button("Lock thread"));
    await waitFor(() => expect(screen.getByRole("status").textContent).toBe("Thread locked. Nobody can post or edit."));
    expect(sentFields(mocks.setThreadLocked.mock.calls[0])).toEqual({ threadId, lock: "true" });
    await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1));
  });

  it("sends lock false for a locked thread", async () => {
    mocks.setThreadLocked.mockResolvedValue({ tone: "status", message: "Thread unlocked." });
    render(<ThreadModeration thread={{ ...thread, locked: true }} onChanged={() => {}} />);
    fireEvent.click(button("Unlock thread"));
    await waitFor(() => expect(screen.getByRole("status").textContent).toBe("Thread unlocked."));
    expect(sentFields(mocks.setThreadLocked.mock.calls[0]).lock).toBe("false");
  });

  it("does not call onChanged when the change is refused", async () => {
    mocks.setThreadLocked.mockResolvedValue({ tone: "alert", message: "That thread is not available." });
    const onChanged = vi.fn();
    render(<ThreadModeration thread={thread} onChanged={onChanged} />);
    fireEvent.click(button("Lock thread"));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toBe("That thread is not available."));
    expect(onChanged).not.toHaveBeenCalled();
  });
});
