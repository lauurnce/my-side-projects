import type { Activity, Attempt } from "@/lib/quiz";

export const fixedNow = Date.parse("2026-11-27T04:00:00.000Z");

export function quiz(id: string, overrides: Partial<Activity> = {}): Activity {
  return {
    id,
    classId: "class-1",
    lessonId: null,
    title: `Quiz ${id}`,
    instructionsMd: "",
    points: 12,
    dueAt: "2026-11-28T15:59:00.000Z",
    publishedAt: "2026-11-26T00:00:00.000Z",
    requiresDeckId: null,
    attemptLimit: 1,
    timeLimitMin: 20,
    showAnswers: "never",
    ...overrides,
  };
}

export function attemptOn(activityId: string, overrides: Partial<Attempt> = {}): Attempt {
  return {
    id: `attempt-${activityId}-${overrides.attemptNo ?? 1}`,
    activityId,
    studentId: "student-1",
    attemptNo: 1,
    startedAt: "2026-11-26T01:00:00.000Z",
    expiresAt: null,
    submittedAt: "2026-11-26T02:00:00.000Z",
    score: 4,
    maxScore: 5,
    ...overrides,
  };
}

export function openOn(activityId: string, attemptNo = 1): Attempt {
  return attemptOn(activityId, { attemptNo, submittedAt: null, score: null });
}

export const pastDue = "2026-11-26T15:59:00.000Z";
