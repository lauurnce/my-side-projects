import { describe, expect, it } from "vitest";
import { createDeckSchema, createRefusedMessage, createdDeckId, editorMessages, saveDeckSchema, toSaveAnswer } from "./editor-schema";

const deckId = "7b0f6a52-1c1d-4f6e-9d55-0d6d3a1f2c11";

describe("toSaveAnswer", () => {
  it.each([
    [{ status: "saved", version: 3 }, { status: "saved", version: 3 }],
    [{ status: "conflict", version: 7 }, { status: "conflict", version: 7 }],
    [{ status: "live", session_id: "s-1" }, { status: "live", sessionId: "s-1" }],
    [{ status: "too_large" }, { status: "too_large" }],
    [{ status: "missing_image" }, { status: "missing_image" }],
    [{ status: "bad_content" }, { status: "refused" }],
    [{ status: "not_found" }, { status: "refused" }],
    [{ status: "saved" }, { status: "failed" }],
    [{ status: "live" }, { status: "failed" }],
    [{ status: "something_new" }, { status: "failed" }],
    [null, { status: "failed" }],
    ["saved", { status: "failed" }],
  ])("reads %j", (value, answer) => {
    expect(toSaveAnswer(value)).toEqual(answer);
  });
});

describe("creating a deck", () => {
  it("reads the new deck id only from a created answer", () => {
    expect(createdDeckId({ status: "created", deck_id: deckId })).toBe(deckId);
    expect(createdDeckId({ status: "created", deck_id: "../hub" })).toBeNull();
    expect(createdDeckId({ status: "refused", deck_id: deckId })).toBeNull();
    expect(createdDeckId(null)).toBeNull();
  });

  it("maps each refusal to its sentence and never passes an unknown one through", () => {
    expect(createRefusedMessage({ status: "refused" })).toBe(editorMessages.refused);
    expect(createRefusedMessage({ status: "bad_lesson" })).toBe(editorMessages.badLesson);
    expect(createRefusedMessage({ status: "deck_limit" })).toBe(editorMessages.deckLimit);
    expect(createRefusedMessage({ status: "full" })).toBe(editorMessages.full);
    expect(createRefusedMessage({ status: "<b>x</b>" })).toBe(editorMessages.failed);
    expect(createRefusedMessage(undefined)).toBe(editorMessages.failed);
  });

  it("accepts a title with or without a lesson and refuses a blank title", () => {
    expect(createDeckSchema.parse({ classId: deckId, title: "  Week 3  ", lessonId: "" })).toEqual({ classId: deckId, title: "Week 3", lessonId: null });
    expect(createDeckSchema.parse({ classId: deckId, title: "Week 3", lessonId: deckId }).lessonId).toBe(deckId);
    expect(createDeckSchema.safeParse({ classId: deckId, title: "   ", lessonId: "" }).success).toBe(false);
    expect(createDeckSchema.safeParse({ classId: "class", title: "Week 3", lessonId: "" }).success).toBe(false);
  });
});

describe("saveDeckSchema", () => {
  it("needs a deck id, a version, a save id and some content", () => {
    const input = { deckId, knownVersion: 2, saveId: deckId, content: { v: 1 } };
    expect(saveDeckSchema.safeParse(input).success).toBe(true);
    expect(saveDeckSchema.safeParse({ ...input, knownVersion: 0 }).success).toBe(false);
    expect(saveDeckSchema.safeParse({ ...input, knownVersion: 1.5 }).success).toBe(false);
    expect(saveDeckSchema.safeParse({ ...input, saveId: "again" }).success).toBe(false);
    expect(saveDeckSchema.safeParse({ ...input, deckId: "deck" }).success).toBe(false);
  });
});
