import { inflateRawSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { megabyte, submissionUpload } from "@/lib/config";
import { findZipDirectory, localDataOffset, localHeaderLength, zipEntries } from "@/lib/deck-file";
import {
  checkChosenSubmission,
  checkStoredSubmission,
  declaresMacros,
  hasPdfEnd,
  isWordDocument,
  submissionKindOf,
  type SubmissionKind,
  type SubmissionProblem,
} from "@/lib/submission-file";
import { buildDocx, buildMacroDocument, buildPdf, buildPptx, buildZip } from "../../tests/fixtures/deck-files";

const pdfType = submissionUpload.mimeTypeByExtension.pdf;
const docxType = submissionUpload.mimeTypeByExtension.docx;
const encoder = new TextEncoder();

function entryText(file: Uint8Array, name: string): string | null {
  const directory = findZipDirectory(file, file.length);
  if (!directory) return null;
  const entries = zipEntries(file.subarray(directory.offset, directory.offset + directory.size), directory.entries);
  const entry = entries?.find((item) => item.name === name);
  if (!entry) return null;
  const start = localDataOffset(file.subarray(entry.localOffset, entry.localOffset + localHeaderLength), entry.localOffset);
  if (start === null) return null;
  const data = file.subarray(start, start + entry.compressedSize);
  return entry.method === 8 ? inflateRawSync(data).toString("utf8") : new TextDecoder().decode(data);
}

function verdict(kind: SubmissionKind, file: Uint8Array, contentType: string): SubmissionProblem | null {
  const problem = checkStoredSubmission(kind, { size: file.length, contentType, head: file.subarray(0, 8) });
  if (problem) return problem;
  if (kind === "pdf") return hasPdfEnd(file.subarray(Math.max(0, file.length - 1024))) ? null : "not_pdf";

  const directory = findZipDirectory(file, file.length);
  const entries = directory
    ? zipEntries(file.subarray(directory.offset, directory.offset + directory.size), directory.entries)
    : null;
  const names = entries?.map((entry) => entry.name) ?? [];
  if (!isWordDocument(names)) return "not_docx";
  return declaresMacros(names, entryText(file, "[Content_Types].xml") ?? "") ? "has_macros" : null;
}

describe("chosen file", () => {
  it("knows the two kinds by extension, in any case", () => {
    expect(submissionKindOf("Essay.Final.PDF")).toBe("pdf");
    expect(submissionKindOf("essay.docx")).toBe("docx");
    expect(submissionKindOf("essay.doc")).toBeNull();
    expect(submissionKindOf("essay.docm")).toBeNull();
    expect(submissionKindOf("essay.pdf.exe")).toBeNull();
    expect(submissionKindOf("essay")).toBeNull();
  });

  it("accepts a PDF and a DOCX of 25 MB or less", () => {
    expect(checkChosenSubmission({ name: "essay.pdf", size: 2048 })).toBeNull();
    expect(checkChosenSubmission({ name: "essay.docx", size: 25 * megabyte })).toBeNull();
  });

  it("rejects 26 MB", () => {
    expect(checkChosenSubmission({ name: "essay.pdf", size: 26 * megabyte })).toBe("too_large");
    expect(checkChosenSubmission({ name: "essay.docx", size: 25 * megabyte + 1 })).toBe("too_large");
  });

  it("rejects another extension and an empty file", () => {
    expect(checkChosenSubmission({ name: "essay.pptx", size: 2048 })).toBe("wrong_extension");
    expect(checkChosenSubmission({ name: "essay.pdf", size: 0 })).toBe("empty");
  });
});

describe("stored file", () => {
  it("passes a real PDF", () => {
    expect(verdict("pdf", buildPdf(3), pdfType)).toBeNull();
  });

  it("passes a real DOCX, compressed or stored", () => {
    expect(verdict("docx", buildDocx(), docxType)).toBeNull();
    expect(verdict("docx", buildDocx({ deflate: false }), docxType)).toBeNull();
  });

  it("rejects a text file renamed to .pdf and to .docx", () => {
    const text = encoder.encode("These are my notes, saved as text and renamed.");
    expect(verdict("pdf", text, pdfType)).toBe("not_pdf");
    expect(verdict("docx", text, docxType)).toBe("not_docx");
  });

  it("rejects a DOCX stored as the PDF and a PDF stored as the DOCX", () => {
    expect(verdict("pdf", buildDocx(), pdfType)).toBe("not_pdf");
    expect(verdict("docx", buildPdf(1), docxType)).toBe("not_docx");
  });

  it("rejects a PDF that was cut short", () => {
    const pdf = buildPdf(3);
    expect(verdict("pdf", pdf.subarray(0, pdf.length - 40), pdfType)).toBe("not_pdf");
  });

  it("rejects 26 MB whatever the browser declared", () => {
    const pdf = buildPdf(1);
    expect(checkStoredSubmission("pdf", { size: 26 * megabyte, contentType: pdfType, head: pdf.subarray(0, 8) })).toBe(
      "too_large",
    );
  });

  it("rejects a file stored under another type", () => {
    expect(verdict("pdf", buildPdf(1), docxType)).toBe("wrong_type");
    expect(verdict("docx", buildDocx(), "text/html")).toBe("wrong_type");
  });

  it("rejects a zip that is not a Word document", () => {
    expect(verdict("docx", buildPptx(), docxType)).toBe("not_docx");
    expect(verdict("docx", buildZip(["notes.txt"], "[Content_Types].xml word/document.xml"), docxType)).toBe("not_docx");
  });

  it("rejects a document with macros even when the macro part has another name", () => {
    expect(verdict("docx", buildMacroDocument(), docxType)).toBe("has_macros");
    expect(declaresMacros(["word/vbaProject.bin"], "")).toBe(true);
    expect(declaresMacros(["word/document.xml"], "plain")).toBe(false);
  });
});
