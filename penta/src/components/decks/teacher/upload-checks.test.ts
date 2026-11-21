import { describe, expect, it } from "vitest";
import { megabyte } from "@/lib/config";
import {
  checkPageCount,
  chosenFileLabel,
  chosenFileProblem,
  loadsSlowly,
  openFailureMessage,
  progressLabel,
  uploadMessages,
  uploadPercent,
} from "./upload-checks";

describe("opening the PDF", () => {
  it("names a password protected file", () => {
    expect(openFailureMessage({ name: "PasswordException", message: "No password given" })).toBe(
      "This PDF is password protected. Remove the password and try again.",
    );
  });

  it("gives one sentence for every other failure", () => {
    const broken = "This PDF could not be opened. Export it again and retry.";
    expect(openFailureMessage({ name: "InvalidPDFException" })).toBe(broken);
    expect(openFailureMessage(new Error("worker failed"))).toBe(broken);
    expect(openFailureMessage(null)).toBe(broken);
    expect(openFailureMessage("PasswordException")).toBe(broken);
  });
});

describe("page count", () => {
  it("accepts 1 to 300 pages", () => {
    expect(checkPageCount(1)).toEqual({ ok: true, pages: 1 });
    expect(checkPageCount(300)).toEqual({ ok: true, pages: 300 });
  });

  it("refuses more than 300 pages with the real count", () => {
    expect(checkPageCount(301)).toEqual({
      ok: false,
      message: "This PDF has 301 pages. A deck can have 300 at most.",
    });
  });

  it("treats a file with no pages as one that could not be opened", () => {
    expect(checkPageCount(0)).toEqual({ ok: false, message: uploadMessages.brokenPdf });
    expect(checkPageCount(Number.NaN)).toEqual({ ok: false, message: uploadMessages.brokenPdf });
  });
});

describe("chosen file", () => {
  it("passes a file of the right kind", () => {
    expect(chosenFileProblem("pdf", { name: "Week 1.PDF", size: megabyte })).toBeNull();
    expect(chosenFileProblem("pptx", { name: "week-1.pptx", size: megabyte })).toBeNull();
  });

  it("explains each problem", () => {
    expect(chosenFileProblem("pdf", { name: "week-1.pptx", size: megabyte })).toBe("Choose a file that ends in .pdf.");
    expect(chosenFileProblem("pptx", { name: "week-1.pptm", size: megabyte })).toBe("Choose a file that ends in .pptx.");
    expect(chosenFileProblem("pdf", { name: "week-1.pdf", size: 0 })).toBe("The PDF is empty.");
    expect(chosenFileProblem("pptx", { name: "week-1.pptx", size: 50 * megabyte + 1 })).toBe(
      "The PPTX is larger than 50 MB.",
    );
  });

  it("writes the name and the size as text", () => {
    expect(chosenFileLabel({ name: "week-1.pdf", size: 3.2 * megabyte })).toBe("week-1.pdf, 3.2 MB");
  });

  it("warns above 20 MB only", () => {
    expect(loadsSlowly(null)).toBe(false);
    expect(loadsSlowly({ size: 20 * megabyte })).toBe(false);
    expect(loadsSlowly({ size: 20 * megabyte + 1 })).toBe(true);
  });
});

describe("upload progress", () => {
  it("counts one file", () => {
    expect(uploadPercent([0], [200])).toBe(0);
    expect(uploadPercent([84], [200])).toBe(42);
    expect(uploadPercent([200], [200])).toBe(100);
  });

  it("adds both files by their sizes", () => {
    const sizes = [300, 100];
    expect(uploadPercent([150, 0], sizes)).toBe(37);
    expect(uploadPercent([300, 0], sizes)).toBe(75);
    expect(uploadPercent([300, 50], sizes)).toBe(87);
    expect(uploadPercent([300, 100], sizes)).toBe(100);
  });

  it("never passes 100 and never goes below 0", () => {
    expect(uploadPercent([900, 900], [300, 100])).toBe(100);
    expect(uploadPercent([-5], [300])).toBe(0);
    expect(uploadPercent([], [])).toBe(0);
    expect(uploadPercent([10], [0])).toBe(0);
  });

  it("stays below 100 until the last byte", () => {
    expect(uploadPercent([299, 100], [300, 100])).toBe(99);
  });

  it("writes the percent as text", () => {
    expect(progressLabel(42)).toBe("Uploading 42%");
  });
});
