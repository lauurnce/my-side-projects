import { describe, expect, it } from "vitest";
import { deckUpload, storagePlan, submissionUpload } from "@/lib/config";

const megabyte = 1024 * 1024;

describe("upload limits", () => {
  it("caps submissions at 25 MB of DOCX or PDF", () => {
    expect(submissionUpload.maxBytes).toBe(25 * megabyte);
    expect(Object.keys(submissionUpload.mimeTypeByExtension).sort()).toEqual(["docx", "pdf"]);
  });

  it("caps decks at 50 MB of PDF or PPTX", () => {
    expect(deckUpload.maxBytes).toBe(50 * megabyte);
    expect(Object.keys(deckUpload.mimeTypeByExtension).sort()).toEqual(["pdf", "pptx"]);
  });

  it("keeps every upload within the storage file limit", () => {
    expect(submissionUpload.maxBytes).toBeLessThanOrEqual(storagePlan.maxFileBytes);
    expect(deckUpload.maxBytes).toBeLessThanOrEqual(storagePlan.maxFileBytes);
  });

  it("needs direct uploads because both caps exceed a function body", () => {
    expect(submissionUpload.maxBytes).toBeGreaterThan(storagePlan.functionBodyBytes);
    expect(deckUpload.maxBytes).toBeGreaterThan(storagePlan.functionBodyBytes);
  });
});
