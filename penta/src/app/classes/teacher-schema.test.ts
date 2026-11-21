import { describe, expect, it } from "vitest";
import { createClassSchema, removeStudentSchema } from "./teacher-schema";

const good = { code: "COMP 018", title: "Web Development", section: "BSIT 3-3", term: "1st Sem AY 2026-27" };

function errorFields(input: Record<string, unknown>) {
  const result = createClassSchema.safeParse(input);
  if (result.success) return [];
  return result.error.issues.map((issue) => issue.path[0]);
}

describe("createClassSchema", () => {
  it("accepts good input", () => {
    expect(createClassSchema.parse(good)).toEqual(good);
  });

  it("accepts an empty section and term", () => {
    expect(createClassSchema.parse({ ...good, section: "", term: "" })).toMatchObject({ section: "", term: "" });
  });

  it("trims every field", () => {
    expect(
      createClassSchema.parse({ code: "  COMP 018 ", title: "\tWeb Development\n", section: " BSIT 3-3 ", term: "  " }),
    ).toEqual({ code: "COMP 018", title: "Web Development", section: "BSIT 3-3", term: "" });
  });

  it("refuses a missing or blank course code", () => {
    expect(errorFields({ ...good, code: "" })).toEqual(["code"]);
    expect(errorFields({ ...good, code: "   " })).toEqual(["code"]);
    expect(errorFields({ title: good.title, section: "", term: "" })).toEqual(["code"]);
  });

  it("refuses a course code over 20 characters and allows exactly 20", () => {
    expect(errorFields({ ...good, code: "C".repeat(21) })).toEqual(["code"]);
    expect(errorFields({ ...good, code: "C".repeat(20) })).toEqual([]);
  });

  it("refuses a blank title and a title over 120 characters", () => {
    expect(errorFields({ ...good, title: " " })).toEqual(["title"]);
    expect(errorFields({ ...good, title: "T".repeat(121) })).toEqual(["title"]);
    expect(errorFields({ ...good, title: "T".repeat(120) })).toEqual([]);
  });

  it("refuses a section or term over 40 characters", () => {
    expect(errorFields({ ...good, section: "S".repeat(41) })).toEqual(["section"]);
    expect(errorFields({ ...good, term: "T".repeat(41) })).toEqual(["term"]);
    expect(errorFields({ ...good, section: "S".repeat(40), term: "T".repeat(40) })).toEqual([]);
  });

  it("refuses a direction override character in any field", () => {
    for (const field of ["code", "title", "section", "term"] as const) {
      expect(errorFields({ ...good, [field]: "AB‮CD" })).toEqual([field]);
    }
  });

  it("refuses control, zero width and isolate characters inside a value", () => {
    for (const character of ["\u0001", "\u001F", "\u007F", "​", "‏", "‪", "⁦", "⁩", "A﻿B"]) {
      expect(errorFields({ ...good, title: `Web${character}Dev` })).toEqual(["title"]);
    }
  });

  it("keeps ordinary non-Latin text", () => {
    expect(errorFields({ ...good, title: "Araling Panlipunan ñ é 日本語" })).toEqual([]);
  });

  it("gives a plain message for each kind of error", () => {
    const messages = (input: Record<string, unknown>) => {
      const result = createClassSchema.safeParse(input);
      return result.success ? [] : result.error.issues.map((issue) => issue.message);
    };
    expect(messages({ ...good, code: "" })).toEqual(["Enter the course code"]);
    expect(messages({ ...good, title: "T".repeat(121) })).toEqual(["Title must be 120 characters or fewer"]);
    expect(messages({ ...good, term: "A‮B" })).toEqual(["Term has characters that are not allowed"]);
  });
});

describe("removeStudentSchema", () => {
  const classId = "3f2b8c1e-6a4d-4e5f-9b7a-1c2d3e4f5a6b";
  const studentId = "9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d";

  it("accepts two uuids", () => {
    expect(removeStudentSchema.parse({ classId, studentId })).toEqual({ classId, studentId });
  });

  it("refuses anything else", () => {
    expect(removeStudentSchema.safeParse({ classId, studentId: "sam" }).success).toBe(false);
    expect(removeStudentSchema.safeParse({ classId: null, studentId }).success).toBe(false);
    expect(removeStudentSchema.safeParse({ classId: `${classId}?x=1`, studentId }).success).toBe(false);
  });
});
