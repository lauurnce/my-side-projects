import { describe, expect, it } from "vitest";
import { lessonBodySchema, lessonMinutesSchema, lessonTitleSchema, moduleTitleSchema } from "@/lib/lesson-rules";

describe("titles", () => {
  it("trims and accepts a normal title", () => {
    expect(moduleTitleSchema.parse("  Week 1  ")).toBe("Week 1");
    expect(lessonTitleSchema.parse("Message brokers")).toBe("Message brokers");
  });

  it.each(["", "   ", "a‮b", "a​b", "a\nb"])("refuses %j", (value) => {
    expect(lessonTitleSchema.safeParse(value).success).toBe(false);
  });

  it("limits the length", () => {
    expect(moduleTitleSchema.safeParse("a".repeat(121)).success).toBe(false);
    expect(lessonTitleSchema.safeParse("a".repeat(160)).success).toBe(true);
    expect(lessonTitleSchema.safeParse("a".repeat(161)).success).toBe(false);
  });
});

describe("lesson body", () => {
  it("keeps newlines and tabs and normalises line endings", () => {
    expect(lessonBodySchema.parse("a\r\n\tb\rc")).toBe("a\n\tb\nc");
  });

  it("allows an empty body and emoji joins", () => {
    expect(lessonBodySchema.parse("")).toBe("");
    expect(lessonBodySchema.safeParse("family \u{1F468}‍\u{1F469}").success).toBe(true);
  });

  it.each(["a‮b", "a\u0000b", "a\u0007b", "a﻿b"])("refuses %j", (value) => {
    expect(lessonBodySchema.safeParse(value).success).toBe(false);
  });

  it("limits the length after normalising line endings", () => {
    expect(lessonBodySchema.safeParse("a".repeat(50000)).success).toBe(true);
    expect(lessonBodySchema.safeParse("a".repeat(50001)).success).toBe(false);
  });

  it("refuses very deep quotes and indents", () => {
    expect(lessonBodySchema.safeParse(`${">".repeat(12)} fine`).success).toBe(true);
    expect(lessonBodySchema.safeParse(`${">".repeat(13)} deep`).success).toBe(false);
    expect(lessonBodySchema.safeParse(`${"> ".repeat(20)}deep`).success).toBe(false);
    expect(lessonBodySchema.safeParse(`${" ".repeat(49)}- deep`).success).toBe(false);
    expect(lessonBodySchema.safeParse(`${" ".repeat(48)}- fine`).success).toBe(true);
  });
});

describe("lesson minutes", () => {
  it("coerces form text to a whole number", () => {
    expect(lessonMinutesSchema.parse("15")).toBe(15);
  });

  it.each(["0", "601", "1.5", "abc", ""])("refuses %j", (value) => {
    expect(lessonMinutesSchema.safeParse(value).success).toBe(false);
  });
});
