import { beforeEach, describe, expect, it, vi } from "vitest";
import { gradebookModel } from "@/lib/gradebook";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  isClassOwner: vi.fn(),
  loadGradebook: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({}) }));
vi.mock("@/lib/classes", () => ({ isClassOwner: mocks.isClassOwner }));
vi.mock("@/components/grades/gradebook/load", () => ({ loadGradebook: mocks.loadGradebook }));

import { dynamic, GET } from "./route";

const classId = "7b0f6a52-1c1d-4f6e-9d55-0d6d3a1f2c11";
const teacher = { id: "teacher-1", fullName: "Tess Lim", role: "teacher" };
const student = { id: "student-1", fullName: "Bea Cruz", role: "student" };

const model = gradebookModel({
  activities: [{ id: "quiz-1", type: "quiz", title: "Brokers", points: 20, dueAt: null }],
  roster: [{ id: "s-bea", fullName: "Bea Cruz" }],
  cells: [
    {
      studentId: "s-bea",
      activityId: "quiz-1",
      state: "graded",
      score: 18,
      points: 20,
      late: true,
      submittedAt: "2026-11-26T02:00:00.000Z",
    },
  ],
});

function get(id = classId) {
  return GET(new Request(`http://localhost/classes/${id}/grades.csv`), { params: Promise.resolve({ id }) });
}

async function summary(response: Response) {
  return {
    status: response.status,
    body: await response.text(),
    cache: response.headers.get("Cache-Control"),
    type: response.headers.get("Content-Type"),
    disposition: response.headers.get("Content-Disposition"),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getCurrentUser.mockResolvedValue(teacher);
  mocks.isClassOwner.mockResolvedValue(true);
  mocks.loadGradebook.mockResolvedValue({ status: "ready", code: "INTE 301", title: "Systems", students: 1, model });
});

describe("GET /classes/[id]/grades.csv", () => {
  it("is never cached or prerendered", () => {
    expect(dynamic).toBe("force-dynamic");
  });

  it("sends the table as a download for the class teacher", async () => {
    const response = await get();
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("text/csv; charset=utf-8");
    expect(response.headers.get("Content-Disposition")).toBe('attachment; filename="INTE-301-grades.csv"');
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(new Uint8Array(await response.clone().arrayBuffer()).slice(0, 3)).toEqual(new Uint8Array([0xef, 0xbb, 0xbf]));
    expect(await response.text()).toBe(
      '"Student","Brokers (score, out of 20)","Brokers (status)","Total earned","Total possible","Percent","Not graded"\r\n' +
        '"Bea Cruz",18,"Late",18,20,90,0\r\n',
    );
    expect(mocks.isClassOwner).toHaveBeenCalledWith(expect.anything(), classId, teacher.id);
  });

  it("answers every refused caller with the same 404", async () => {
    mocks.isClassOwner.mockResolvedValue(false);
    const otherTeacher = await summary(await get());

    mocks.isClassOwner.mockResolvedValue(true);
    mocks.getCurrentUser.mockResolvedValue(student);
    const asStudent = await summary(await get());

    mocks.getCurrentUser.mockResolvedValue(null);
    const signedOut = await summary(await get());

    mocks.getCurrentUser.mockResolvedValue(teacher);
    const badId = await summary(await get("not-a-uuid"));

    mocks.loadGradebook.mockResolvedValue({ status: "not_found" });
    const missing = await summary(await get());

    const expected = { status: 404, body: "Not found", cache: "no-store", type: "text/plain;charset=UTF-8", disposition: null };
    for (const refused of [otherTeacher, asStudent, signedOut, badId, missing]) expect(refused).toEqual(expected);
  });

  it("does not load grades for a student, a signed out caller or a bad id", async () => {
    mocks.getCurrentUser.mockResolvedValue(student);
    await get();
    mocks.getCurrentUser.mockResolvedValue(null);
    await get();
    mocks.getCurrentUser.mockResolvedValue(teacher);
    await get("not-a-uuid");
    mocks.isClassOwner.mockResolvedValue(false);
    await get();
    expect(mocks.loadGradebook).not.toHaveBeenCalled();
  });

  it("sends no file when the grades could not all be loaded", async () => {
    mocks.loadGradebook.mockResolvedValue({ status: "failed" });
    const response = await get();
    expect(response.status).toBe(503);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(response.headers.get("Content-Disposition")).toBeNull();
  });
});
