import { describe, expect, it } from "vitest";
import {
  addPostSchema,
  addPostState,
  askQuestionSchema,
  askRefusedState,
  askedThreadId,
  editPostSchema,
  editPostState,
  idOf,
  invalidState,
  threadMessages,
  unixLines,
} from "./schema";

const classId = "3f2b8c1e-6a4d-4e5f-9b7a-1c2d3e4f5a6b";
const lessonId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const activityId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const threadId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const postId = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const thumb = "\u{1F44D}";
const values = { title: "Kept title", body: "Kept body" };

function question(overrides: Record<string, unknown> = {}) {
  return { classId, lessonId, activityId: null, title: "Why queues?", body: "I do not get it.", ...overrides };
}

function askIssueFields(input: Record<string, unknown>) {
  const parsed = askQuestionSchema.safeParse(input);
  return parsed.success ? [] : parsed.error.issues.map((issue) => issue.path[0]);
}

describe("askQuestionSchema", () => {
  it("accepts a lesson question and trims the title", () => {
    const parsed = askQuestionSchema.parse(question({ title: "  Why queues?  " }));
    expect(parsed.title).toBe("Why queues?");
    expect(parsed.lessonId).toBe(lessonId);
    expect(parsed.activityId).toBeNull();
  });

  it("needs exactly one target", () => {
    expect(askQuestionSchema.safeParse(question({ lessonId: null, activityId })).success).toBe(true);
    expect(askIssueFields(question({ lessonId: null }))).toEqual(["target"]);
    expect(askIssueFields(question({ activityId }))).toEqual(["target"]);
    expect(askIssueFields(question({ lessonId: "nope" }))).toContain("lessonId");
    expect(askIssueFields(question({ classId: "nope" }))).toContain("classId");
  });

  it("bounds the title in characters", () => {
    expect(askIssueFields(question({ title: "   " }))).toEqual(["title"]);
    expect(askQuestionSchema.safeParse(question({ title: "a".repeat(160) })).success).toBe(true);
    expect(askQuestionSchema.safeParse(question({ title: thumb.repeat(160) })).success).toBe(true);
    expect(askIssueFields(question({ title: "a".repeat(161) }))).toEqual(["title"]);
    expect(askIssueFields(question({ title: null }))).toEqual(["title"]);
  });
});

describe("the post body", () => {
  function body(text: unknown) {
    return addPostSchema.safeParse({ threadId, parentId: null, body: text });
  }

  it("is counted in characters, not code units", () => {
    expect(thumb.repeat(2000).length).toBe(4000);
    expect(body(thumb.repeat(2000)).success).toBe(true);
    expect(body(thumb.repeat(2001)).success).toBe(false);
    expect(body("a".repeat(2000)).success).toBe(true);
    expect(body("a".repeat(2001)).success).toBe(false);
  });

  it("counts a Windows line break as one character and sends a plain line break", () => {
    const lines = `${"a".repeat(1000)}\r\n${"b".repeat(999)}`;
    const parsed = body(lines);
    expect(parsed.success && parsed.data.body).toBe(`${"a".repeat(1000)}\n${"b".repeat(999)}`);
    expect(body(`${lines}c`).success).toBe(false);
    expect(unixLines("a\r\nb\rc")).toBe("a\nb\nc");
  });

  it("refuses an empty or blank body", () => {
    expect(body("").success).toBe(false);
    expect(body(" \r\n ").success).toBe(false);
    expect(body(null).success).toBe(false);
  });

  it("takes an optional parent and a post id for edits", () => {
    expect(addPostSchema.safeParse({ threadId, parentId: postId, body: "ok" }).success).toBe(true);
    expect(addPostSchema.safeParse({ threadId, parentId: "nope", body: "ok" }).success).toBe(false);
    expect(addPostSchema.safeParse({ threadId: "nope", parentId: null, body: "ok" }).success).toBe(false);
    expect(editPostSchema.safeParse({ postId, body: "ok" }).success).toBe(true);
    expect(editPostSchema.safeParse({ postId: "nope", body: "ok" }).success).toBe(false);
  });
});

describe("invalidState", () => {
  function failure(input: Record<string, unknown>) {
    const parsed = askQuestionSchema.safeParse(input);
    if (parsed.success) throw new Error("expected a failure");
    return invalidState(parsed.error, values);
  }

  it("names the field, gives its sentence and keeps the typed values", () => {
    expect(failure(question({ title: "" }))).toEqual({
      tone: "alert",
      message: "Enter a title for your question.",
      field: "title",
      values,
    });
    expect(failure(question({ title: "a".repeat(161) })).message).toBe(
      "Give your question a title of 160 characters or fewer.",
    );
    expect(failure(question({ body: "" }))).toMatchObject({ field: "body", message: "Write something before posting." });
    expect(failure(question({ body: "a".repeat(2001) }))).toMatchObject({
      field: "body",
      message: "Use 2,000 characters or fewer.",
    });
  });

  it("answers a bad id like a missing one", () => {
    expect(failure(question({ classId: "nope" }))).toEqual({
      tone: "alert",
      message: "This is not available.",
      field: undefined,
      values,
    });
    expect(failure(question({ lessonId: null })).message).toBe("This is not available.");
  });
});

describe("form helpers", () => {
  it("reads an empty or missing id as null", () => {
    const formData = new FormData();
    formData.set("parentId", "");
    formData.set("threadId", threadId);
    expect(idOf(formData, "parentId")).toBeNull();
    expect(idOf(formData, "lessonId")).toBeNull();
    expect(idOf(formData, "threadId")).toBe(threadId);
  });

  it("reads the new thread id only from an asked answer", () => {
    expect(askedThreadId({ status: "asked", thread_id: threadId })).toBe(threadId);
    expect(askedThreadId({ status: "asked", thread_id: "../login" })).toBeNull();
    expect(askedThreadId({ status: "full", thread_id: threadId })).toBeNull();
    expect(askedThreadId(null)).toBeNull();
  });
});

const sharedSentences: [string, string][] = [
  ["bad_body", "Your text was not accepted. Keep it under 2,000 characters and 60 lines, and remove hidden characters or deeply nested lists."],
  ["bad_name", "Your display name matches your teacher's name. Change your name before posting."],
  ["slow_down", "You are posting too fast. Wait a minute and try again."],
  ["limit_reached", "You have reached the posting limit for now. Try again later."],
  ["not_found", "This is not available."],
];

describe("askRefusedState", () => {
  it.each([
    ...sharedSentences,
    ["bad_title", "Give your question a title of 160 characters or fewer."],
    ["full", "This lesson or activity already has the most questions it can hold."],
    ["asked_enough", "You have asked the most questions one person can ask here."],
  ])("maps %s to its sentence and keeps the values", (status, sentence) => {
    expect(askRefusedState({ status }, values)).toMatchObject({ tone: "alert", message: sentence, values });
  });

  it("marks the field a refusal is about", () => {
    expect(askRefusedState({ status: "bad_title" }, values).field).toBe("title");
    expect(askRefusedState({ status: "bad_body" }, values).field).toBe("body");
    expect(askRefusedState({ status: "full" }, values).field).toBeUndefined();
  });

  it("never passes an unknown answer through", () => {
    expect(askRefusedState(null, values).message).toBe("Something went wrong. Try again.");
    expect(askRefusedState({ status: "secret detail" }, values).message).toBe("Something went wrong. Try again.");
    expect(askRefusedState({ status: "asked" }, values).message).toBe("Something went wrong. Try again.");
  });
});

describe("addPostState", () => {
  it("reports a post with a status and no values, so the form clears", () => {
    expect(addPostState({ status: "posted", post_id: postId }, values)).toEqual({ tone: "status", message: "Posted" });
  });

  it.each([
    ...sharedSentences,
    ["locked", "This thread is locked."],
    ["bad_parent", "You can only reply to a top-level post."],
    ["full", "This thread is full."],
  ])("maps %s to its sentence and keeps the values", (status, sentence) => {
    expect(addPostState({ status }, values)).toMatchObject({ tone: "alert", message: sentence, values });
  });

  it("falls back to one fixed sentence", () => {
    expect(addPostState(null, values).message).toBe("Something went wrong. Try again.");
    expect(addPostState({ status: "bad_title" }, values).message).toBe("Something went wrong. Try again.");
  });
});

describe("editPostState", () => {
  it("reports a saved edit", () => {
    expect(editPostState({ status: "edited" }, values)).toEqual({ tone: "status", message: "Saved" });
  });

  it.each([
    ["unchanged", "Nothing changed."],
    ["too_late", "Posts can be edited for 15 minutes."],
    ["too_many_edits", "A post can be edited 3 times."],
    ["locked", "This thread is locked."],
    ["bad_body", sharedSentences[0][1]],
    ["not_found", "This is not available."],
  ])("maps %s to its sentence and keeps the values", (status, sentence) => {
    expect(editPostState({ status }, values)).toMatchObject({ tone: "alert", message: sentence, values });
  });

  it("falls back to one fixed sentence", () => {
    expect(editPostState({ status: "slow_down" }, values).message).toBe("Something went wrong. Try again.");
  });
});

describe("not_found", () => {
  it("has one sentence in every function", () => {
    const sentences = [askRefusedState, addPostState, editPostState].map(
      (toState) => toState({ status: "not_found" }, values).message,
    );
    expect(new Set(sentences)).toEqual(new Set([threadMessages.notFound]));
  });
});
