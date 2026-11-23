import { describe, expect, it } from "vitest";
import { submissionMessages, type SubmissionProblem } from "@/lib/submission-file";
import {
  completionStep,
  handInFailure,
  handInMessages,
  inspectionStep,
  reserveStep,
  startHandInSchema,
  startInputMessage,
  uploadTargetSchema,
} from "./handin-schema";

const activityId = "7b0f6a52-1c1d-4f6e-9d55-0d6d3a1f2c11";
const uploadId = "0d6d3a1f-2c11-4f6e-9d55-7b0f6a521c1d";
const path = `class/activity/student/${uploadId}.pdf`;

function startProblem(input: unknown): string | null {
  const parsed = startHandInSchema.safeParse(input);
  return parsed.success ? null : startInputMessage(parsed.error);
}

describe("hand-in input", () => {
  it("accepts an activity id with a file name and size", () => {
    expect(startProblem({ activityId, file: { name: "essay.pdf", size: 1200 } })).toBeNull();
  });

  it("answers that the activity is not available for a bad id", () => {
    expect(startProblem({ activityId: "nope", file: { name: "essay.pdf", size: 1200 } })).toBe(
      "This activity is not available.",
    );
    expect(startProblem({ file: { name: "essay.pdf", size: 1200 } })).toBe("This activity is not available.");
  });

  it("refuses a file that is not a name and a number", () => {
    const sentence = "That file could not be read. Choose it again.";
    expect(startProblem({ activityId })).toBe(sentence);
    expect(startProblem({ activityId, file: { name: "", size: 10 } })).toBe(sentence);
    expect(startProblem({ activityId, file: { name: "essay.pdf", size: "10" } })).toBe(sentence);
    expect(startProblem({ activityId, file: { name: "essay.pdf", size: Number.NaN } })).toBe(sentence);
    expect(startProblem({ activityId, file: { name: `${"a".repeat(300)}.pdf`, size: 10 } })).toBe(sentence);
  });

  it("drops fields the client should not send", () => {
    const parsed = startHandInSchema.parse({
      activityId,
      path: "other/student/file.pdf",
      file: { name: "essay.pdf", size: 10, path: "other/student/file.pdf" },
    });
    expect(parsed).toEqual({ activityId, file: { name: "essay.pdf", size: 10 } });
  });

  it("needs an upload id to finish or cancel", () => {
    expect(uploadTargetSchema.safeParse({ uploadId }).success).toBe(true);
    expect(uploadTargetSchema.safeParse({ uploadId: path }).success).toBe(false);
    expect(uploadTargetSchema.safeParse({}).success).toBe(false);
  });
});

describe("reserve reply", () => {
  it("signs only a reserved upload with an id", () => {
    expect(reserveStep({ status: "reserved", upload_id: uploadId })).toEqual({ step: "sign", uploadId });
    expect(reserveStep({ status: "reserved" })).toEqual({ step: "stop", message: handInMessages.failed });
    expect(reserveStep({ status: "reserved", upload_id: "../etc" })).toEqual({
      step: "stop",
      message: handInMessages.failed,
    });
  });

  it.each([
    ["not_found", "This activity is not available."],
    ["bad_kind", "Choose a file that ends in .pdf or .docx."],
    ["too_large", "That file is larger than 25 MB."],
    ["graded", "This work is already graded, so the file cannot be replaced."],
    ["full", "Storage is full, so new files cannot be accepted right now. Tell your teacher."],
  ])("maps %s to its own sentence", (status, message) => {
    expect(reserveStep({ status })).toEqual({ step: "stop", message });
  });

  it("does not show the free bytes of a full reply", () => {
    const step = reserveStep({ status: "full", free_bytes: 123456 });
    expect(step).toEqual({ step: "stop", message: handInMessages.full });
    expect(JSON.stringify(step)).not.toContain("123456");
  });

  it("uses a fixed sentence for anything unexpected", () => {
    for (const reply of [null, "reserved", {}, { status: "surprise" }, { status: 4 }]) {
      expect(reserveStep(reply)).toEqual({ step: "stop", message: "The file could not be handed in. Try again." });
    }
  });
});

describe("inspection decision", () => {
  it("completes a good file with its real size and etag", () => {
    expect(inspectionStep({ status: "ok", bytes: 900, etag: "abc" })).toEqual({ step: "complete", bytes: 900, etag: "abc" });
  });

  it("keeps everything when the upload did not finish or storage is down", () => {
    expect(inspectionStep({ status: "incomplete" })).toEqual({
      step: "keep",
      message: "The upload did not finish. Try again.",
    });
    expect(inspectionStep({ status: "unavailable" })).toEqual({
      step: "keep",
      message: "Storage is not available right now. Try again in a moment.",
    });
  });

  it("removes an invalid file and names the problem", () => {
    const problems = Object.keys(submissionMessages) as SubmissionProblem[];
    for (const problem of problems) {
      expect(inspectionStep({ status: "invalid", problem })).toEqual({
        step: "remove",
        message: submissionMessages[problem],
      });
    }
  });
});

describe("completion reply", () => {
  it("finishes and hands back the old path to remove", () => {
    expect(completionStep({ status: "completed", old_path: path })).toEqual({ step: "done", oldPath: path });
    expect(completionStep({ status: "completed", old_path: null })).toEqual({ step: "done", oldPath: null });
    expect(completionStep({ status: "completed" })).toEqual({ step: "done", oldPath: null });
  });

  it("removes a file that grew past the declared size", () => {
    expect(completionStep({ status: "too_large", file_path: path })).toEqual({
      step: "remove",
      path,
      message: "The uploaded file is larger than the file you chose. Upload it again.",
    });
  });

  it("removes a file that arrived after grading", () => {
    expect(completionStep({ status: "graded", file_path: path })).toEqual({
      step: "remove",
      path,
      message: "This work is already graded, so the file cannot be replaced.",
    });
  });

  it("deletes nothing when the upload is no longer pending", () => {
    expect(completionStep({ status: "not_pending" })).toEqual({
      step: "keep",
      message: "This upload was replaced by a newer one, or it is already finished.",
    });
  });

  it("deletes nothing for an unexpected reply", () => {
    for (const reply of [null, {}, { status: "surprise", file_path: path }]) {
      expect(completionStep(reply)).toEqual({ step: "keep", message: handInMessages.failed });
    }
  });
});

describe("student sentences", () => {
  const sentences = [...Object.values(handInMessages), ...Object.values(submissionMessages)];

  it("never contain a byte count", () => {
    for (const sentence of sentences) {
      expect(sentence.replace("25 MB", "")).not.toMatch(/\d|bytes|\bKB\b|\bMB\b|\bGB\b/i);
    }
  });

  it("never contain a storage path", () => {
    for (const sentence of sentences) expect(sentence).not.toContain("/");
  });

  it("wraps a failure with its message", () => {
    expect(handInFailure(handInMessages.full)).toEqual({ status: "error", message: handInMessages.full });
  });
});
