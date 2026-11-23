import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import type { ThreadFormState } from "@/app/threads/schema";
import type { OpenThread, ThreadPost } from "@/lib/threads";
import type { ThreadLive } from "../useThreadLive";
import { ThreadScreen } from "../ThreadScreen";
import { characterCountLabel } from "./helpers";

const live = vi.hoisted(() => ({ current: null as unknown, bodyRenders: [] as string[] }));
const actions = vi.hoisted(() => ({ addPost: vi.fn(), editPost: vi.fn() }));

vi.mock("../useThreadLive", () => ({ useThreadLive: () => live.current }));
vi.mock("@/app/threads/actions", () => actions);
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));
vi.mock("../PostModeration", () => ({
  PostModeration: ({ post }: { post: ThreadPost }) => <button data-moderates={post.id}>Hide</button>,
}));
vi.mock("../ThreadModeration", () => ({ ThreadModeration: () => <button>Lock thread</button> }));
vi.mock("@/components/ui/Markdown", async (importActual) => {
  const actual = await importActual<typeof import("@/components/ui/Markdown")>();
  function PostMarkdown({ children }: { children: string }) {
    live.bodyRenders.push(children);
    if (children === "This body breaks the renderer") throw new Error("render failed");
    return <actual.PostMarkdown>{children}</actual.PostMarkdown>;
  }
  return { ...actual, PostMarkdown };
});

const threadId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const classId = "3f2b8c1e-6a4d-4e5f-9b7a-1c2d3e4f5a6b";
const lessonId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const user = { id: "u1", fullName: "Ana Reyes", role: "student" as const };
const thumb = "\u{1F44D}";

function post(id: string, overrides: Partial<ThreadPost> = {}): ThreadPost {
  return {
    id,
    parentId: null,
    isQuestion: false,
    authorName: "Ben Cruz",
    authorRole: "student",
    mine: false,
    canEdit: false,
    body: `Body of ${id}`,
    createdAt: "2026-11-27T02:00:00Z",
    editedAt: null,
    hidden: false,
    authorId: null,
    authorInClass: true,
    editCount: 0,
    ...overrides,
  };
}

const posts = [
  post("answer", { authorName: "Sir Dela Cruz", authorRole: "teacher" }),
  post("reply", { parentId: "answer", authorName: "Teacher", mine: true, canEdit: true }),
  post("question", { isQuestion: true, authorName: "Ana Reyes", editedAt: "2026-11-27T02:05:00Z" }),
  post("second", { body: "A second answer" }),
];

function thread(overrides: Partial<OpenThread["thread"]> = {}, withPosts = posts): OpenThread {
  return {
    status: "ok",
    version: 1,
    thread: {
      id: threadId,
      classId,
      lessonId,
      activityId: null,
      targetTitle: "Message queues",
      title: "Why do queues help?",
      locked: false,
      canModerate: false,
      ...overrides,
    },
    posts: withPosts,
  };
}

const refresh = vi.fn(async () => undefined);

function show(view: OpenThread | null, link: ThreadLive["link"] = "live") {
  live.current = { view, link, refresh };
}

function open(view: OpenThread | null = thread(), link: ThreadLive["link"] = "live") {
  show(view, link);
  return render(<ThreadScreen user={user} initial={thread()} />);
}

function card(container: HTMLElement, id: string) {
  return container.querySelector(`[data-post-id="${id}"]`) as HTMLElement;
}

async function typeInto(field: HTMLElement, text: string) {
  await act(async () => {
    fireEvent.change(field, { target: { value: text } });
  });
}

async function submit(field: HTMLElement) {
  await act(async () => {
    fireEvent.submit(field.closest("form")!);
  });
}

async function press(button: HTMLElement) {
  await act(async () => {
    fireEvent.click(button);
  });
}

function sent(action: typeof actions.addPost) {
  const formData = action.mock.calls[0][1] as FormData;
  return Object.fromEntries(formData.entries());
}

beforeEach(() => {
  live.bodyRenders = [];
  refresh.mockClear();
  actions.addPost.mockReset().mockResolvedValue({ tone: "status", message: "Posted" } satisfies ThreadFormState);
  actions.editPost.mockReset().mockResolvedValue({ tone: "status", message: "Saved" } satisfies ThreadFormState);
});

afterEach(cleanup);

describe("characterCountLabel", () => {
  it("counts characters the way the database does", () => {
    expect(characterCountLabel("")).toBe("0 of 2,000 characters");
    expect(characterCountLabel(thumb.repeat(3))).toBe("3 of 2,000 characters");
    expect(characterCountLabel("a\r\nb")).toBe("3 of 2,000 characters");
    expect(characterCountLabel("  padded  ")).toBe("6 of 2,000 characters");
    expect(characterCountLabel("a".repeat(1240))).toBe("1,240 of 2,000 characters");
    expect(characterCountLabel(thumb.repeat(2000))).toBe("2,000 of 2,000 characters");
    expect(characterCountLabel(thumb.repeat(2001))).toBe("Too long to post");
  });
});

describe("ThreadScreen", () => {
  it("shows the header with one heading and a link back to the lesson", () => {
    open();
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Why do queues help?");
    expect(screen.getAllByRole("heading")).toHaveLength(1);
    const back = screen.getByRole("link", { name: "Back to Message queues" });
    expect(back.getAttribute("href")).toBe(`/classes/${classId}/lessons/${lessonId}`);
    expect(screen.getByText("Layer 03 · Ops")).toBeTruthy();
    expect(screen.getByText("Question")).toBeTruthy();
    expect(screen.getByText("Something wrong? Tell your teacher.")).toBeTruthy();
  });

  it("puts the question first and each reply under its post", () => {
    const { container } = open();
    const order = [...container.querySelectorAll("[data-post-id]")].map((element) =>
      element.getAttribute("data-post-id"),
    );
    expect(order).toEqual(["question", "answer", "reply", "second"]);
    const answerGroup = card(container, "answer").closest("li")!;
    expect(within(answerGroup).getByText("Body of reply")).toBeTruthy();
    expect(card(container, "second").closest("li")!.querySelector("ol")).toBeNull();
  });

  it("labels the teacher from the role and never from the name", () => {
    const { container } = open();
    expect(card(container, "answer").querySelector("[data-role-label]")?.textContent).toBe("Teacher");
    expect(card(container, "reply").querySelector("bdi")?.textContent).toBe("Teacher");
    expect(card(container, "reply").querySelector("[data-role-label]")).toBeNull();
    expect(container.querySelectorAll("[data-role-label]")).toHaveLength(1);
  });

  it("marks your own posts, edited posts and shows the time in Manila", () => {
    const { container } = open();
    expect(within(card(container, "reply")).getByText("You")).toBeTruthy();
    expect(within(card(container, "question")).queryByText("You")).toBeNull();
    expect(within(card(container, "question")).getByText("edited")).toBeTruthy();
    expect(within(card(container, "answer")).queryByText("edited")).toBeNull();
    expect(within(card(container, "answer")).getByText("Nov 27, 10:00 AM")).toBeTruthy();
  });

  it("gives a student no moderation controls and no hidden marker", () => {
    const { container } = open(thread({}, [...posts, post("odd", { hidden: true, authorInClass: false })]));
    expect(screen.queryByText("Hidden from students")).toBeNull();
    expect(screen.queryByText("No longer in this class")).toBeNull();
    expect(screen.queryByRole("button", { name: "Hide" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Lock thread" })).toBeNull();
    expect(container.querySelector("[data-moderates]")).toBeNull();
  });

  it("shows the teacher the hidden post, its marker and the moderation controls", () => {
    const hidden = post("hidden", { hidden: true, body: "Rude words", authorInClass: false });
    const { container } = open(thread({ canModerate: true }, [...posts, hidden]));
    expect(within(card(container, "hidden")).getByText("Hidden from students")).toBeTruthy();
    expect(within(card(container, "hidden")).getByText("Rude words")).toBeTruthy();
    expect(within(card(container, "hidden")).getByText("No longer in this class")).toBeTruthy();
    expect(screen.getAllByText("Hidden from students")).toHaveLength(1);
    expect(container.querySelectorAll("[data-moderates]")).toHaveLength(5);
    expect(screen.getByRole("button", { name: "Lock thread" })).toBeTruthy();
    expect(screen.queryByText("Something wrong? Tell your teacher.")).toBeNull();
  });

  it("offers no forms on a locked thread and says why", () => {
    open(thread({ locked: true }));
    expect(screen.getByText("This thread is locked.")).toBeTruthy();
    expect(screen.getByText("Locked")).toBeTruthy();
    expect(screen.queryAllByRole("textbox")).toHaveLength(0);
    expect(screen.queryByRole("button", { name: "Reply" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Edit" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Post answer" })).toBeNull();
  });

  it("clears every post when the thread is gone", () => {
    const view = open();
    expect(screen.getByText("Body of question")).toBeTruthy();
    show(null);
    view.rerender(<ThreadScreen user={user} initial={thread()} />);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("This question is no longer available.");
    expect(screen.getByRole("link").getAttribute("href")).toBe("/classes");
    expect(view.container.textContent).not.toContain("Body of");
    expect(view.container.textContent).not.toContain("Why do queues help?");
    expect(view.container.textContent).not.toContain("Ana Reyes");
    expect(screen.queryAllByRole("textbox")).toHaveLength(0);
  });

  it("falls back to plain text when a body cannot be rendered and keeps the moderation slot", () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const broken = post("broken", { body: "This body breaks the renderer" });
    const { container } = open(thread({ canModerate: true }, [...posts, broken]));
    const plain = within(card(container, "broken")).getByText("This body breaks the renderer");
    expect(plain.tagName).toBe("P");
    expect(card(container, "broken").querySelector('[data-moderates="broken"]')).toBeTruthy();
    expect(screen.getByText("Body of question")).toBeTruthy();
    logged.mockRestore();
  });

  it("shows markup in a body as text", () => {
    const body = 'Look <script>alert("x")</script> and <img src=x onerror=alert(1)>';
    const { container } = open(thread({}, [post("question", { isQuestion: true, body })]));
    expect(container.querySelector("script")).toBeNull();
    expect(container.querySelector("img")).toBeNull();
    expect(card(container, "question").textContent).toContain('<script>alert("x")</script>');
  });

  it("says when live updates are paused", () => {
    const text = "Live updates are paused. New replies appear within a few seconds.";
    const view = open(thread(), "catching_up");
    expect(screen.getByText(text)).toBeTruthy();
    show(thread(), "live");
    view.rerender(<ThreadScreen user={user} initial={thread()} />);
    expect(screen.queryByText(text)).toBeNull();
  });

  it("counts the answer live, emoji included, and explains the formatting", async () => {
    open();
    const field = screen.getByLabelText("Your answer");
    expect(screen.getByText("0 of 2,000 characters")).toBeTruthy();
    await typeInto(field, `${thumb}${thumb} ok`);
    expect(screen.getByText("5 of 2,000 characters")).toBeTruthy();
    await typeInto(field, thumb.repeat(2001));
    expect(screen.getByText("Too long to post")).toBeTruthy();
    expect(
      screen.getByText(
        "Plain text with simple formatting: *emphasis*, **strong**, `code`, lists, quotes and links. No images.",
      ),
    ).toBeTruthy();
    expect(field.hasAttribute("maxlength")).toBe(false);
  });

  it("posts an answer, clears the field and refreshes at once", async () => {
    open();
    const field = screen.getByLabelText("Your answer") as HTMLTextAreaElement;
    await typeInto(field, "Because work can wait.");
    await submit(field);
    expect(sent(actions.addPost)).toEqual({ threadId, body: "Because work can wait." });
    expect(field.value).toBe("");
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("status").textContent).toBe("Posted");
  });

  it("keeps the typed text and shows the sentence when a post is refused", async () => {
    const message = "You are posting too fast. Wait a minute and try again.";
    actions.addPost.mockResolvedValue({ tone: "alert", message, values: { body: "Too quick" } });
    open();
    const field = screen.getByLabelText("Your answer") as HTMLTextAreaElement;
    await typeInto(field, "Too quick");
    await submit(field);
    expect(field.value).toBe("Too quick");
    expect(screen.getByRole("alert").textContent).toBe(message);
    expect(refresh).not.toHaveBeenCalled();
  });

  it("disables the button while a post is on its way", async () => {
    let finish: (state: ThreadFormState) => void = () => undefined;
    actions.addPost.mockReturnValue(new Promise<ThreadFormState>((resolve) => (finish = resolve)));
    open();
    const button = screen.getByRole("button", { name: "Post answer" }) as HTMLButtonElement;
    await typeInto(screen.getByLabelText("Your answer"), "Wait for it");
    await submit(button);
    expect(button.disabled).toBe(true);
    await act(async () => finish({ tone: "status", message: "Posted" }));
    expect(button.disabled).toBe(false);
  });

  it("opens one reply form at a time, only on top-level posts", async () => {
    const { container } = open();
    expect(within(card(container, "reply")).queryByRole("button", { name: "Reply" })).toBeNull();
    await press(within(card(container, "answer")).getByRole("button", { name: "Reply" }));
    expect(within(card(container, "answer")).getByLabelText("Your reply")).toBeTruthy();
    await press(within(card(container, "second")).getByRole("button", { name: "Reply" }));
    expect(screen.getAllByLabelText("Your reply")).toHaveLength(1);
    expect(within(card(container, "second")).getByLabelText("Your reply")).toBeTruthy();
  });

  it("sends a reply under its post, then closes the form and refreshes", async () => {
    const { container } = open();
    await press(within(card(container, "answer")).getByRole("button", { name: "Reply" }));
    const field = screen.getByLabelText("Your reply");
    await typeInto(field, "Thank you");
    await submit(screen.getByRole("button", { name: "Post reply" }));
    expect(sent(actions.addPost)).toEqual({ threadId, parentId: "answer", body: "Thank you" });
    expect(screen.queryByLabelText("Your reply")).toBeNull();
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("lets you edit only a post you may edit, with the rule shown", async () => {
    const { container } = open();
    expect(screen.getAllByRole("button", { name: "Edit" })).toHaveLength(1);
    await press(within(card(container, "reply")).getByRole("button", { name: "Edit" }));
    const field = within(card(container, "reply")).getByRole("textbox") as HTMLTextAreaElement;
    expect(field.value).toBe("Body of reply");
    expect(screen.getByText("You can edit for 15 minutes, up to 3 times.")).toBeTruthy();
    await press(screen.getByRole("button", { name: "Cancel" }));
    expect(within(card(container, "reply")).queryByRole("textbox")).toBeNull();
    expect(within(card(container, "reply")).getByText("Body of reply")).toBeTruthy();
  });

  it("saves an edit, then closes the editor and refreshes", async () => {
    const { container } = open();
    await press(within(card(container, "reply")).getByRole("button", { name: "Edit" }));
    await typeInto(within(card(container, "reply")).getByRole("textbox"), "Better words");
    await submit(screen.getByRole("button", { name: "Save edit" }));
    expect(sent(actions.editPost)).toEqual({ postId: "reply", body: "Better words" });
    expect(within(card(container, "reply")).queryByRole("textbox")).toBeNull();
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("keeps the editor open with the sentence when an edit is refused", async () => {
    const message = "Posts can be edited for 15 minutes.";
    actions.editPost.mockResolvedValue({ tone: "alert", message, values: { body: "Late words" } });
    const { container } = open();
    await press(within(card(container, "reply")).getByRole("button", { name: "Edit" }));
    const field = within(card(container, "reply")).getByRole("textbox") as HTMLTextAreaElement;
    await typeInto(field, "Late words");
    await submit(field);
    expect(field.value).toBe("Late words");
    expect(screen.getByRole("alert").textContent).toBe(message);
  });

  it("renders again only the post that changed", () => {
    const view = open();
    live.bodyRenders = [];
    const changed = posts.map((each) =>
      each.id === "second" ? { ...each, body: "A better second answer", editedAt: "2026-11-27T02:09:00Z" } : { ...each },
    );
    show({ ...thread({}, changed), version: 2 });
    view.rerender(<ThreadScreen user={user} initial={thread()} />);
    expect(new Set(live.bodyRenders)).toEqual(new Set(["A better second answer"]));
    expect(screen.getByText("A better second answer")).toBeTruthy();
  });
});
