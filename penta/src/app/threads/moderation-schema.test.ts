import { describe, expect, it } from "vitest";
import {
  failedState,
  moderationMessages,
  postHiddenState,
  postIdSchema,
  setPostHiddenSchema,
  setThreadLockedSchema,
  threadLockedState,
  toHistoryEvents,
} from "./moderation-schema";

const postId = "11111111-1111-4111-8111-111111111111";
const threadId = "22222222-2222-4222-8222-222222222222";

describe("setPostHiddenSchema", () => {
  it("reads the hide flag from its two strings", () => {
    expect(setPostHiddenSchema.parse({ postId, hide: "true", threadId })).toEqual({ postId, hide: true, threadId });
    expect(setPostHiddenSchema.parse({ postId, hide: "false", threadId }).hide).toBe(false);
  });

  it.each(["", "yes", "1", "TRUE", null, undefined, true])("refuses the hide value %j", (hide) => {
    expect(setPostHiddenSchema.safeParse({ postId, hide, threadId }).success).toBe(false);
  });

  it.each(["", "not-an-id", `${postId}x`, "../classes", null, undefined, 7])("refuses the post id %j", (value) => {
    expect(setPostHiddenSchema.safeParse({ postId: value, hide: "true", threadId }).success).toBe(false);
  });

  it.each(["", "../../classes", "threads/1", null, undefined])("drops the thread id %j and keeps the rest", (value) => {
    expect(setPostHiddenSchema.parse({ postId, hide: "true", threadId: value })).toEqual({
      postId,
      hide: true,
      threadId: null,
    });
  });
});

describe("setThreadLockedSchema", () => {
  it("reads the lock flag from its two strings", () => {
    expect(setThreadLockedSchema.parse({ threadId, lock: "true" })).toEqual({ threadId, lock: true });
    expect(setThreadLockedSchema.parse({ threadId, lock: "false" })).toEqual({ threadId, lock: false });
  });

  it("refuses a bad thread id or a bad flag", () => {
    expect(setThreadLockedSchema.safeParse({ threadId: "abc", lock: "true" }).success).toBe(false);
    expect(setThreadLockedSchema.safeParse({ threadId: null, lock: "true" }).success).toBe(false);
    expect(setThreadLockedSchema.safeParse({ threadId, lock: "on" }).success).toBe(false);
    expect(setThreadLockedSchema.safeParse({ threadId, lock: null }).success).toBe(false);
  });
});

describe("postIdSchema", () => {
  it("accepts a uuid only", () => {
    expect(postIdSchema.safeParse(postId).success).toBe(true);
    expect(postIdSchema.safeParse("1 or 1=1").success).toBe(false);
    expect(postIdSchema.safeParse(undefined).success).toBe(false);
  });
});

describe("status sentences", () => {
  it("has the frozen sentences", () => {
    expect(moderationMessages).toMatchObject({
      hidden: "Hidden from students",
      shown: "Shown to students again",
      postNotFound: "That post is not available.",
      locked: "Thread locked. Nobody can post or edit.",
      unlocked: "Thread unlocked.",
      threadNotFound: "That thread is not available.",
    });
  });

  it("maps every post answer to its sentence", () => {
    expect(postHiddenState({ status: "hidden" })).toEqual({ tone: "status", message: "Hidden from students" });
    expect(postHiddenState({ status: "shown" })).toEqual({ tone: "status", message: "Shown to students again" });
    expect(postHiddenState({ status: "not_found" })).toEqual({ tone: "alert", message: "That post is not available." });
  });

  it("maps every thread answer to its sentence", () => {
    expect(threadLockedState({ status: "locked" })).toEqual({
      tone: "status",
      message: "Thread locked. Nobody can post or edit.",
    });
    expect(threadLockedState({ status: "unlocked" })).toEqual({ tone: "status", message: "Thread unlocked." });
    expect(threadLockedState({ status: "not_found" })).toEqual({
      tone: "alert",
      message: "That thread is not available.",
    });
  });

  it.each([null, undefined, "hidden", 3, [], {}, { status: 1 }, { status: "locked now" }, { status: "permission denied" }])(
    "answers %j with the fixed failure sentence",
    (result) => {
      expect(postHiddenState(result)).toEqual(failedState());
      expect(threadLockedState(result)).toEqual(failedState());
      expect(failedState()).toEqual({ tone: "alert", message: "Something went wrong. Try again." });
    },
  );

  it("does not accept a thread answer for a post or a post answer for a thread", () => {
    expect(postHiddenState({ status: "locked" })).toEqual(failedState());
    expect(threadLockedState({ status: "hidden" })).toEqual(failedState());
  });
});

describe("toHistoryEvents", () => {
  const happened_at = "2026-11-27T14:42:00Z";

  it("maps an edit with its earlier text and a Manila time", () => {
    expect(toHistoryEvents([{ kind: "edit", old_body: "First draft", actor_name: "Ana Reyes", happened_at }])).toEqual([
      { kind: "edit", oldBody: "First draft", actorName: "Ana Reyes", happenedAt: "Nov 27, 2026, 10:42 PM, Manila time" },
    ]);
  });

  it("maps a hide and an unhide without any text", () => {
    const events = toHistoryEvents([
      { kind: "hide", old_body: "left over", actor_name: "Maria Santos", happened_at },
      { kind: "unhide", old_body: null, actor_name: "Maria Santos", happened_at },
    ]);
    expect(events.map((event) => [event.kind, event.oldBody, event.actorName])).toEqual([
      ["hide", "", "Maria Santos"],
      ["unhide", "", "Maria Santos"],
    ]);
  });

  it.each([null, "", "   "])("names a missing actor %j as a deleted account", (actor_name) => {
    expect(toHistoryEvents([{ kind: "edit", old_body: "x", actor_name, happened_at }])[0].actorName).toBe(
      "Deleted account",
    );
  });

  it("keeps the earlier text exactly as written", () => {
    const old_body = "<script>alert(1)</script>\n\n**bold** [x](javascript:alert(1))";
    expect(toHistoryEvents([{ kind: "edit", old_body, actor_name: "Ana Reyes", happened_at }])[0].oldBody).toBe(old_body);
  });

  it("drops an unknown kind and survives a bad or missing time", () => {
    const events = toHistoryEvents([
      { kind: "delete", old_body: "x", actor_name: "Ana Reyes", happened_at },
      { kind: "hide", old_body: null, actor_name: "Ana Reyes", happened_at: "not a date" },
      { kind: "unhide", old_body: null, actor_name: "Ana Reyes", happened_at: null },
    ]);
    expect(events.map((event) => [event.kind, event.happenedAt])).toEqual([
      ["hide", ""],
      ["unhide", ""],
    ]);
  });

  it("answers an empty list with an empty list", () => {
    expect(toHistoryEvents([])).toEqual([]);
  });
});
