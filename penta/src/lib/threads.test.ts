import { describe, expect, it } from "vitest";
import { countCharacters, groupPosts, threadTargetHref, threadsFor, toThreadView, type ThreadPost } from "@/lib/threads";

const post = (id: string, overrides: Record<string, unknown> = {}) => ({
  id,
  parent_id: null,
  is_question: false,
  author_name: "Ana Reyes",
  author_role: "student",
  mine: false,
  can_edit: false,
  body: `body ${id}`,
  created_at: "2026-11-27T01:00:00Z",
  edited_at: null,
  ...overrides,
});

const reply = {
  status: "ok",
  version: 4,
  thread: {
    id: "t1",
    class_id: "c1",
    lesson_id: "l1",
    activity_id: null,
    target_title: "Roles and privileges",
    title: "Why revoke usage?",
    locked: false,
    can_moderate: false,
  },
  posts: [post("a", { is_question: true }), post("b"), post("c", { parent_id: "a", mine: true, can_edit: true })],
};

describe("thread view", () => {
  it("reads an open thread a student receives, with no moderation fields", () => {
    const view = toThreadView(reply);
    expect(view).toMatchObject({ status: "ok", version: 4, thread: { title: "Why revoke usage?", canModerate: false } });
    const posts = view && view.status === "ok" ? view.posts : [];
    expect(posts).toHaveLength(3);
    expect(posts[2]).toMatchObject({ parentId: "a", mine: true, canEdit: true, hidden: false, authorId: null });
  });

  it("reads the teacher fields when they are sent", () => {
    const view = toThreadView({
      ...reply,
      posts: [post("a", { hidden: true, author_id: "u1", author_in_class: false, edit_count: 2 })],
    });
    const posts = view && view.status === "ok" ? view.posts : [];
    expect(posts[0]).toMatchObject({ hidden: true, authorId: "u1", authorInClass: false, editCount: 2 });
  });

  it("keeps not found and unchanged apart from a broken answer", () => {
    expect(toThreadView({ status: "not_found" })).toEqual({ status: "not_found" });
    expect(toThreadView({ status: "unchanged", version: 4 })).toEqual({ status: "unchanged", version: 4 });
    expect(toThreadView(null)).toBeNull();
    expect(toThreadView({ status: "ok" })).toBeNull();
    expect(toThreadView({ status: "ok", version: 1, thread: {}, posts: [] })).toBeNull();
  });
});

describe("thread helpers", () => {
  const posts = (toThreadView(reply) as { posts: ThreadPost[] }).posts;

  it("puts the question first and replies under their post", () => {
    const groups = groupPosts([posts[1], posts[2], posts[0]]);
    expect(groups.map((group) => group.post.id)).toEqual(["a", "b"]);
    expect(groups[0].replies.map((item) => item.id)).toEqual(["c"]);
    expect(groups[1].replies).toEqual([]);
  });

  it("filters threads by their lesson or activity", () => {
    const base = { title: "", targetTitle: "", authorName: "", authorRole: "student" as const, createdAt: "", locked: false, replies: 0, lastPostAt: null, hiddenPosts: 0, questionHidden: false };
    const threads = [
      { ...base, id: "1", lessonId: "l1", activityId: null },
      { ...base, id: "2", lessonId: null, activityId: "a1" },
    ];
    expect(threadsFor(threads, { lessonId: "l1" }).map((thread) => thread.id)).toEqual(["1"]);
    expect(threadsFor(threads, { activityId: "a1" }).map((thread) => thread.id)).toEqual(["2"]);
  });

  it("links a thread back to its lesson or activity", () => {
    expect(threadTargetHref({ classId: "c1", lessonId: "l1", activityId: null })).toBe("/classes/c1/lessons/l1");
    expect(threadTargetHref({ classId: "c1", lessonId: null, activityId: "a1" })).toBe("/ops/a1");
  });

  it("counts characters the way the database does", () => {
    expect(countCharacters("a\r\nb")).toBe(3);
    expect(countCharacters("  hi  ")).toBe(2);
    expect(countCharacters("\u{1F600}".repeat(5))).toBe(5);
  });
});
