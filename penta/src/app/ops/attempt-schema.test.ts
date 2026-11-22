import { describe, expect, it } from "vitest";
import {
  buildAnswers,
  capAnswerText,
  replyStatus,
  startMessage,
  startSchema,
  startedAttemptId,
  submitSchema,
  toSentAnswer,
} from "./attempt-schema";

const mcqId = "7b0f6a52-1c1d-4f6e-9d55-0d6d3a1f2c11";
const tfId = "0f3f8e0a-52a7-4b6c-8a44-6f0b0f0f9d22";
const identId = "1a2b3c4d-52a7-4b6c-8a44-6f0b0f0f9d33";
const attemptId = "5c6d7e8f-52a7-4b6c-8a44-6f0b0f0f9d44";

function fields(pairs: [string, string][]): FormData {
  const formData = new FormData();
  for (const [name, value] of pairs) formData.append(name, value);
  return formData;
}

describe("buildAnswers", () => {
  it("gives each kind its real type", () => {
    const formData = fields([
      ["activityId", mcqId],
      ["attemptId", attemptId],
      [`kind.${mcqId}`, "mcq"],
      [`answer.${mcqId}`, "2"],
      [`kind.${tfId}`, "tf"],
      [`answer.${tfId}`, "false"],
      [`kind.${identId}`, "ident"],
      [`answer.${identId}`, "Message broker"],
    ]);

    expect(buildAnswers(formData.entries())).toEqual({ [mcqId]: 2, [tfId]: false, [identId]: "Message broker" });
  });

  it("turns true and false strings into booleans", () => {
    expect(toSentAnswer("tf", "true")).toBe(true);
    expect(toSentAnswer("tf", "false")).toBe(false);
  });

  it("turns index text into numbers", () => {
    expect(toSentAnswer("mcq", "0")).toBe(0);
    expect(toSentAnswer("mcq", "5")).toBe(5);
  });

  it("keeps identification text that looks like another kind as text", () => {
    expect(toSentAnswer("ident", "8080")).toBe("8080");
    expect(toSentAnswer("ident", "true")).toBe("true");
  });

  it("leaves out empty and missing choice fields", () => {
    const formData = fields([
      [`kind.${mcqId}`, "mcq"],
      [`kind.${tfId}`, "tf"],
      [`answer.${tfId}`, ""],
    ]);

    expect(buildAnswers(formData.entries())).toEqual({});
  });

  it("sends a cleared text answer as empty text so an older saved answer is not graded", () => {
    const formData = fields([
      [`kind.${identId}`, "ident"],
      [`answer.${identId}`, "   "],
    ]);

    expect(buildAnswers(formData.entries())).toEqual({ [identId]: "" });
  });

  it.each(["1.5", "abc", "-1", "1e2", "123", " 1"])("drops the junk option index %s", (value) => {
    expect(buildAnswers([[`kind.${mcqId}`, "mcq"], [`answer.${mcqId}`, value]])).toEqual({});
  });

  it.each(["yes", "TRUE", "1", "0"])("drops the junk true or false value %s", (value) => {
    expect(buildAnswers([[`kind.${tfId}`, "tf"], [`answer.${tfId}`, value]])).toEqual({});
  });

  it("ignores names that are not a well formed question id", () => {
    const entries: [string, string][] = [
      ["kind.not-an-id", "ident"],
      ["answer.not-an-id", "text"],
      ["kind.__proto__", "ident"],
      ["answer.__proto__", "text"],
      [`kind.${identId}x`, "ident"],
      [`answer.${identId}x`, "text"],
      ["answer.", "text"],
      [`other.${identId}`, "text"],
    ];

    expect(buildAnswers(entries)).toEqual({});
  });

  it("drops an answer with a missing or unknown kind", () => {
    expect(buildAnswers([[`answer.${identId}`, "text"]])).toEqual({});
    expect(buildAnswers([[`kind.${identId}`, "essay"], [`answer.${identId}`, "text"]])).toEqual({});
  });

  it("drops a file sent in place of text", () => {
    const formData = new FormData();
    formData.append(`kind.${identId}`, "ident");
    formData.append(`answer.${identId}`, new File(["text"], "answer.txt"));

    expect(buildAnswers(formData.entries())).toEqual({});
  });

  it("caps text at 200 characters", () => {
    const answers = buildAnswers([[`kind.${identId}`, "ident"], [`answer.${identId}`, "a".repeat(450)]]);

    expect(answers[identId]).toBe("a".repeat(200));
  });

  it("counts characters and not code units when capping", () => {
    expect(Array.from(capAnswerText("𝒳".repeat(300)))).toHaveLength(200);
  });
});

describe("start replies", () => {
  it.each([
    ["closed", "This quiz is closed. The due time has passed."],
    ["limit", "You have no attempts left."],
    ["locked", "Finish the required deck first."],
    ["not_found", "This quiz is not available."],
    ["something_else", "This quiz is not available."],
    [null, "This quiz is not available."],
  ])("maps %s to its sentence", (status, sentence) => {
    expect(startMessage(status)).toBe(sentence);
  });

  it.each(["started", "resumed"])("reads the attempt id of a %s reply", (status) => {
    expect(startedAttemptId({ status, attempt_id: attemptId })).toBe(attemptId);
  });

  it("gives no attempt id for other replies", () => {
    expect(startedAttemptId({ status: "closed" })).toBeNull();
    expect(startedAttemptId({ status: "started", attempt_id: "../hub" })).toBeNull();
    expect(startedAttemptId(null)).toBeNull();
  });

  it("reads the status of a reply", () => {
    expect(replyStatus({ status: "locked", deck_id: mcqId })).toBe("locked");
    expect(replyStatus("locked")).toBeNull();
    expect(replyStatus(null)).toBeNull();
  });
});

describe("schemas", () => {
  it("accepts well formed ids only", () => {
    expect(startSchema.safeParse({ activityId: mcqId }).success).toBe(true);
    expect(startSchema.safeParse({ activityId: "1" }).success).toBe(false);
    expect(startSchema.safeParse({ activityId: null }).success).toBe(false);
    expect(submitSchema.safeParse({ activityId: mcqId, attemptId }).success).toBe(true);
    expect(submitSchema.safeParse({ activityId: mcqId, attemptId: "x" }).success).toBe(false);
  });
});
