import { describe, expect, it } from "vitest";
import { megabyte } from "@/lib/config";
import { deckFileMessages } from "@/lib/deck-file";
import {
  chosenFilesMessage,
  completionStep,
  deckIntentSchema,
  deckMessages,
  deckTargetSchema,
  deckTitleSchema,
  finishDeckUploadSchema,
  finishInputMessage,
  inspectionStep,
  lessonLinkErrorMessage,
  reserveErrorMessage,
  reserveMessage,
  setDeckLessonSchema,
  startDeckUploadSchema,
  startInputMessage,
  toReserveResult,
} from "./upload-schema";

const classId = "3f2b8c1e-6a4d-4e5f-9b7a-1c2d3e4f5a6b";
const deckId = "11111111-1111-4111-8111-111111111111";
const lessonId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

const start = {
  classId,
  title: "Week 1 slides",
  lessonId: null,
  pdf: { name: "week-1.pdf", size: 3 * megabyte },
  pptx: null,
};

function reserved(status: string, extra: Record<string, unknown> = {}) {
  return toReserveResult({ status, ...extra });
}

describe("start input", () => {
  it("accepts a PDF alone and trims the title", () => {
    const parsed = startDeckUploadSchema.parse({ ...start, title: "  Week 1 slides  " });
    expect(parsed.title).toBe("Week 1 slides");
    expect(parsed.pptx).toBeNull();
  });

  it("accepts a linked lesson and a PPTX original", () => {
    const parsed = startDeckUploadSchema.safeParse({
      ...start,
      lessonId,
      pptx: { name: "week-1.pptx", size: megabyte },
    });
    expect(parsed.success).toBe(true);
  });

  it("refuses a class id or a lesson id that is not a uuid", () => {
    expect(startDeckUploadSchema.safeParse({ ...start, classId: "1" }).success).toBe(false);
    expect(startDeckUploadSchema.safeParse({ ...start, lessonId: "" }).success).toBe(false);
    expect(startDeckUploadSchema.safeParse({ ...start, lessonId: "not-a-lesson" }).success).toBe(false);
  });

  it("refuses an input that is not the expected object", () => {
    expect(startDeckUploadSchema.safeParse(null).success).toBe(false);
    expect(startDeckUploadSchema.safeParse({ ...start, pdf: "week-1.pdf" }).success).toBe(false);
    expect(startDeckUploadSchema.safeParse({ ...start, pdf: { name: "week-1.pdf", size: "3" } }).success).toBe(false);
  });

  it("names the title problem and falls back to a general sentence", () => {
    const emptyTitle = startDeckUploadSchema.safeParse({ ...start, title: "   " });
    const badClass = startDeckUploadSchema.safeParse({ ...start, classId: "1" });
    expect(emptyTitle.success || startInputMessage(emptyTitle.error)).toBe("Enter a deck title");
    expect(badClass.success || startInputMessage(badClass.error)).toBe(deckMessages.badInput);
  });
});

describe("deck title", () => {
  it("accepts 120 characters and refuses 121", () => {
    expect(deckTitleSchema.safeParse("a".repeat(120)).success).toBe(true);
    const tooLong = deckTitleSchema.safeParse("a".repeat(121));
    expect(tooLong.success || tooLong.error.issues[0].message).toBe("Use 120 characters or fewer");
  });

  it("refuses an empty title and a missing one", () => {
    expect(deckTitleSchema.safeParse("").success).toBe(false);
    expect(deckTitleSchema.safeParse(null).success).toBe(false);
  });

  it.each([
    ["a null byte", "Week\u0000 1"],
    ["a tab", "Week\t1"],
    ["a line break", "Week\n1"],
    ["a delete character", "Week\u007F1"],
    ["a zero width space", "Week​1"],
    ["a right to left override", "Week‮1"],
    ["a directional isolate", "Week⁦1"],
    ["a byte order mark", "Week﻿1"],
  ])("refuses %s", (_name, title) => {
    const parsed = deckTitleSchema.safeParse(title);
    expect(parsed.success || parsed.error.issues[0].message).toBe("Remove hidden or control characters");
  });

  it("keeps accents and other scripts", () => {
    expect(deckTitleSchema.safeParse("Aralin 1: Señales at 信号").success).toBe(true);
  });
});

describe("chosen files", () => {
  it("passes a PDF alone and a PDF with its PPTX", () => {
    expect(chosenFilesMessage(start.pdf, null)).toBeNull();
    expect(chosenFilesMessage(start.pdf, { name: "week-1.pptx", size: megabyte })).toBeNull();
  });

  it("maps each problem to the sentence for that file", () => {
    expect(chosenFilesMessage({ name: "week-1.docx", size: 10 }, null)).toBe(deckFileMessages.wrong_extension.pdf);
    expect(chosenFilesMessage({ name: "week-1.pdf", size: 0 }, null)).toBe(deckFileMessages.empty.pdf);
    expect(chosenFilesMessage({ name: "week-1.pdf", size: 51 * megabyte }, null)).toBe(deckFileMessages.too_large.pdf);
    expect(chosenFilesMessage(start.pdf, { name: "week-1.pptm", size: 10 })).toBe(deckFileMessages.wrong_extension.pptx);
    expect(chosenFilesMessage(start.pdf, { name: "week-1.pptx", size: 51 * megabyte })).toBe(
      deckFileMessages.too_large.pptx,
    );
  });
});

describe("reserve result", () => {
  it("reads the status, the deck id and the free bytes", () => {
    expect(toReserveResult({ status: "reserved", deck_id: deckId })).toEqual({
      status: "reserved",
      deckId,
      freeBytes: 0,
    });
    expect(reserved("full", { free_bytes: 31 * megabyte }).freeBytes).toBe(31 * megabyte);
  });

  it("treats anything else as unknown", () => {
    expect(toReserveResult(null).status).toBe("unknown");
    expect(toReserveResult("reserved").status).toBe("unknown");
    expect(toReserveResult({ status: 4, deck_id: 9, free_bytes: -5 })).toEqual({
      status: "unknown",
      deckId: null,
      freeBytes: 0,
    });
  });

  it("says how much is needed and how much is free when storage is full", () => {
    expect(reserveMessage(reserved("full", { free_bytes: 31 * megabyte }), 48 * megabyte)).toBe(
      "Not enough storage: this deck needs 48 MB and 31 MB is free. Delete a deck or upload a smaller file.",
    );
    expect(reserveMessage(reserved("full", { free_bytes: 0 }), 48 * megabyte)).toBe(
      "Not enough storage: this deck needs 48 MB and nothing is free. Delete a deck or upload a smaller file.",
    );
  });

  it.each([
    ["pending_limit", "You have 3 unfinished uploads. Wait for them to finish or try again later."],
    ["deck_limit", "A class can have 40 decks at most."],
    ["bad_lesson", "That lesson is not in this class."],
    ["refused", "You cannot add decks to this class."],
    ["too_large", "These files are too large. Each file can be 50 MB at most."],
    ["signed_out", "Your session ended. Log in again."],
    ["bad_kind", "Something went wrong. Try again."],
    ["unknown", "Something went wrong. Try again."],
  ])("maps %s to its own sentence", (status, sentence) => {
    expect(reserveMessage(reserved(status), megabyte)).toBe(sentence);
  });

  it("gives every refusal a different sentence", () => {
    const statuses = ["full", "pending_limit", "deck_limit", "bad_lesson", "refused", "too_large", "signed_out"];
    const sentences = statuses.map((status) => reserveMessage(reserved(status), megabyte));
    expect(new Set(sentences).size).toBe(statuses.length);
  });

  it("maps a refused title and hides every other database error", () => {
    expect(reserveErrorMessage({ code: "23514" })).toBe(deckMessages.rejectedTitle);
    expect(reserveErrorMessage({ code: "42501" })).toBe(deckMessages.failed);
    expect(reserveErrorMessage(null)).toBe(deckMessages.failed);
  });
});

describe("finish input", () => {
  it("accepts slide counts from 1 to 300", () => {
    expect(finishDeckUploadSchema.safeParse({ deckId, slideCount: 1 }).success).toBe(true);
    expect(finishDeckUploadSchema.safeParse({ deckId, slideCount: 300 }).success).toBe(true);
  });

  it.each([0, -1, 301, 2.5, Number.NaN, "24", null])("refuses a slide count of %s", (slideCount) => {
    const parsed = finishDeckUploadSchema.safeParse({ deckId, slideCount });
    expect(parsed.success || finishInputMessage(parsed.error)).toBe(deckMessages.tooManyPages);
  });

  it("refuses a deck id that is not a uuid", () => {
    const parsed = finishDeckUploadSchema.safeParse({ deckId: "deck", slideCount: 3 });
    expect(parsed.success || finishInputMessage(parsed.error)).toBe(deckMessages.gone);
    expect(deckTargetSchema.safeParse({ deckId: "deck" }).success).toBe(false);
    expect(deckTargetSchema.safeParse({ deckId: null }).success).toBe(false);
    expect(deckTargetSchema.safeParse({ deckId }).success).toBe(true);
  });
});

describe("finish decisions", () => {
  it("keeps the deck when the upload is not complete or storage does not answer", () => {
    expect(inspectionStep({ status: "incomplete" })).toEqual({
      step: "keep",
      message: "The upload did not finish. Try again.",
    });
    expect(inspectionStep({ status: "unavailable" })).toEqual({
      step: "keep",
      message: "Storage is not available right now. Try again in a moment.",
    });
  });

  it("removes the deck only when a file is definitely wrong", () => {
    expect(inspectionStep({ status: "invalid", kind: "pdf", problem: "not_pdf" })).toEqual({
      step: "remove",
      message: deckFileMessages.not_pdf.pdf,
    });
    expect(inspectionStep({ status: "invalid", kind: "pptx", problem: "not_pptx" })).toEqual({
      step: "remove",
      message: deckFileMessages.not_pptx.pptx,
    });
  });

  it("maps every completion status", () => {
    expect(completionStep("ready")).toEqual({ step: "done" });
    expect(completionStep("not_pending")).toEqual({ step: "recheck" });
    expect(completionStep("larger_than_declared")).toEqual({
      step: "remove",
      message: "The uploaded file is larger than the file you chose. Upload it again.",
    });
    expect(completionStep("bad_slide_count")).toEqual({
      step: "remove",
      message: "This PDF has too many pages. A deck can have 300 at most.",
    });
  });

  it("never removes a deck on an answer it does not know", () => {
    expect(completionStep(null)).toEqual({ step: "keep", message: deckMessages.failed });
    expect(completionStep("something_new")).toEqual({ step: "keep", message: deckMessages.failed });
  });
});

describe("lesson link", () => {
  it("reads an empty lesson as no lesson", () => {
    expect(setDeckLessonSchema.parse({ deckId, lessonId: "" })).toEqual({ deckId, lessonId: null });
    expect(setDeckLessonSchema.parse({ deckId, lessonId })).toEqual({ deckId, lessonId });
  });

  it("refuses bad ids", () => {
    expect(setDeckLessonSchema.safeParse({ deckId, lessonId: "lesson" }).success).toBe(false);
    expect(setDeckLessonSchema.safeParse({ deckId, lessonId: null }).success).toBe(false);
    expect(setDeckLessonSchema.safeParse({ deckId: "", lessonId }).success).toBe(false);
  });

  it("maps a write error to a fixed sentence", () => {
    expect(lessonLinkErrorMessage(null)).toBe(deckMessages.gone);
    expect(lessonLinkErrorMessage({ code: "23514" })).toBe(deckMessages.badLesson);
    expect(lessonLinkErrorMessage({ code: "42501" })).toBe(deckMessages.refused);
    expect(lessonLinkErrorMessage({ code: "XX000" })).toBe(deckMessages.failed);
  });
});

describe("deck intents", () => {
  it("accepts the two form actions only", () => {
    expect(deckIntentSchema.safeParse("deleteDeck").success).toBe(true);
    expect(deckIntentSchema.safeParse("setDeckLesson").success).toBe(true);
    expect(deckIntentSchema.safeParse("startDeckUpload").success).toBe(false);
  });
});
