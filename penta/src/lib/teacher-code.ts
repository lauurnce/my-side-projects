import { createHash, timingSafeEqual } from "node:crypto";

export const teacherCodeMinLength = 20;

function digest(value: string): Buffer {
  return createHash("sha256").update(value).digest();
}

export function isTeacherCode(input: string, expected: string | undefined): boolean {
  if (!expected || expected.length < teacherCodeMinLength) return false;
  return timingSafeEqual(digest(input), digest(expected));
}
