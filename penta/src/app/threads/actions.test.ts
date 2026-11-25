import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getCurrentUser: vi.fn(), rpc: vi.fn(), redirect: vi.fn() }));

vi.mock("@/lib/auth", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ rpc: mocks.rpc }) }));
vi.mock("@/lib/threads", async (original) => ({
  ...(await original<typeof import("@/lib/threads")>()),
  loadThreadView: async () => null,
  threadTargetHref: () => "/",
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));

import { addPost, askQuestion, editPost } from "./actions";
import { threadMessages } from "./schema";

const id = "7b0f6a52-1c1d-4f6e-9d55-0d6d3a1f2c11";

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [name, value] of Object.entries(fields)) data.set(name, value);
  return data;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getCurrentUser.mockResolvedValue(null);
});

describe("thread actions after the session ended", () => {
  it("keep the typed text, say what happened, and do not redirect or write", async () => {
    const asked = await askQuestion({}, form({ title: "Backups", body: "How often?", classId: id, lessonId: id }));
    const posted = await addPost({}, form({ body: "Every night.", threadId: id }));
    const edited = await editPost({}, form({ body: "Every night at two.", postId: id }));

    expect(asked).toEqual({ tone: "alert", message: threadMessages.sessionEnded, field: undefined, values: { title: "Backups", body: "How often?" } });
    expect(posted).toMatchObject({ tone: "alert", message: threadMessages.sessionEnded, values: { body: "Every night." } });
    expect(edited).toMatchObject({ tone: "alert", message: threadMessages.sessionEnded, values: { body: "Every night at two." } });
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it("post as usual when signed in", async () => {
    mocks.getCurrentUser.mockResolvedValue({ id: "student-1", fullName: "Ana Cruz", role: "student" });
    mocks.rpc.mockResolvedValue({ data: { status: "posted", post_id: id }, error: null });
    expect((await addPost({}, form({ body: "Every night.", threadId: id }))).tone).toBe("status");
    expect(mocks.rpc).toHaveBeenCalledWith("add_post", expect.objectContaining({ target_thread: id, post_body: "Every night." }));
  });
});
