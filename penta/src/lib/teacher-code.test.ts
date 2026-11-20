import { describe, expect, it } from "vitest";
import { isTeacherCode } from "@/lib/teacher-code";

const expected = "correct-horse-battery-staple-42";

describe("isTeacherCode", () => {
  it("accepts the exact code", () => {
    expect(isTeacherCode(expected, expected)).toBe(true);
  });

  it.each(["", "wrong", expected.toUpperCase(), `${expected} `, expected.slice(0, -1)])("refuses %j", (input) => {
    expect(isTeacherCode(input, expected)).toBe(false);
  });

  it("is closed when the code is not set", () => {
    expect(isTeacherCode("", undefined)).toBe(false);
    expect(isTeacherCode("", "")).toBe(false);
  });

  it("is closed when the configured code is shorter than 20 characters", () => {
    expect(isTeacherCode("short-code", "short-code")).toBe(false);
  });
});
