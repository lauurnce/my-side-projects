import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getCurrentUser: vi.fn(), requireRole: vi.fn(), from: vi.fn() }));

vi.mock("@/lib/auth", () => ({ getCurrentUser: mocks.getCurrentUser, requireRole: mocks.requireRole }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ from: mocks.from }) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { saveLesson } from "./routes-actions";
import { routeMessages } from "./routes-schema";

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [name, value] of Object.entries(fields)) data.set(name, value);
  return data;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("saveLesson after the session ended", () => {
  it("keeps the typed lesson and its revision, says what happened, and writes nothing", async () => {
    mocks.getCurrentUser.mockResolvedValue(null);
    const fields = { lessonId: "7b0f6a52-1c1d-4f6e-9d55-0d6d3a1f2c11", revision: "4", title: "Backups", minutes: "15", body: "Take a full backup first." };
    expect(await saveLesson({}, form(fields))).toEqual({
      tone: "alert",
      message: routeMessages.sessionEnded,
      values: { title: "Backups", minutes: "15", body: "Take a full backup first." },
      revision: 4,
    });
    expect(mocks.requireRole).not.toHaveBeenCalled();
    expect(mocks.from).not.toHaveBeenCalled();
  });
});
