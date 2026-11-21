import { describe, expect, it } from "vitest";
import { deckLimits, deckUpload } from "@/lib/config";
import {
  checkChosenFile,
  checkStoredFile,
  extensionOf,
  findZipDirectory,
  isPresentation,
  zipEntryNames,
} from "@/lib/deck-file";
import { buildPdf, buildPptx, buildZip, presentationEntries } from "../../tests/fixtures/deck-files";

const pdfType = deckUpload.mimeTypeByExtension.pdf;
const pptxType = deckUpload.mimeTypeByExtension.pptx;
const encoder = new TextEncoder();

function entryNamesOf(file: Uint8Array): string[] | null {
  const tail = file.subarray(Math.max(0, file.length - deckLimits.zipTailBytes));
  const directory = findZipDirectory(tail, file.length);
  if (!directory) return null;
  return zipEntryNames(file.subarray(directory.offset, directory.offset + directory.size), directory.entries);
}

describe("chosen file", () => {
  it("reads the extension in lower case", () => {
    expect(extensionOf("Week 3.Final.PDF")).toBe("pdf");
    expect(extensionOf("notes")).toBe("");
  });

  it("accepts a PDF and a PPTX within the limit", () => {
    expect(checkChosenFile("pdf", { name: "week-3.pdf", size: 2048 })).toBeNull();
    expect(checkChosenFile("pptx", { name: "week-3.PPTX", size: deckUpload.maxBytes })).toBeNull();
  });

  it("rejects another extension", () => {
    expect(checkChosenFile("pdf", { name: "week-3.pptx", size: 2048 })).toBe("wrong_extension");
    expect(checkChosenFile("pptx", { name: "week-3.pptm", size: 2048 })).toBe("wrong_extension");
    expect(checkChosenFile("pdf", { name: "week-3.pdf.exe", size: 2048 })).toBe("wrong_extension");
  });

  it("rejects an oversized file and an empty one", () => {
    expect(checkChosenFile("pdf", { name: "big.pdf", size: deckUpload.maxBytes + 1 })).toBe("too_large");
    expect(checkChosenFile("pdf", { name: "empty.pdf", size: 0 })).toBe("empty");
    expect(checkChosenFile("pdf", { name: "odd.pdf", size: Number.NaN })).toBe("empty");
  });
});

describe("stored file", () => {
  it("passes a real PDF", () => {
    const pdf = buildPdf(5);
    expect(checkStoredFile("pdf", { size: pdf.length, contentType: pdfType, head: pdf.subarray(0, 8) })).toBeNull();
  });

  it("rejects a text file renamed to .pdf", () => {
    const text = encoder.encode("These are my lecture notes, saved as text.");
    expect(checkStoredFile("pdf", { size: text.length, contentType: pdfType, head: text.subarray(0, 8) })).toBe(
      "not_pdf",
    );
  });

  it("rejects a PPTX stored as the PDF", () => {
    const pptx = buildPptx();
    expect(checkStoredFile("pdf", { size: pptx.length, contentType: pdfType, head: pptx.subarray(0, 8) })).toBe(
      "not_pdf",
    );
  });

  it("rejects an oversized file whatever the browser declared", () => {
    const pdf = buildPdf(1);
    expect(
      checkStoredFile("pdf", { size: deckUpload.maxBytes + 1, contentType: pdfType, head: pdf.subarray(0, 8) }),
    ).toBe("too_large");
  });

  it("rejects a file stored under another type", () => {
    const pdf = buildPdf(1);
    expect(checkStoredFile("pdf", { size: pdf.length, contentType: pptxType, head: pdf.subarray(0, 8) })).toBe(
      "wrong_type",
    );
    expect(checkStoredFile("pdf", { size: pdf.length, contentType: "text/html", head: pdf.subarray(0, 8) })).toBe(
      "wrong_type",
    );
  });

  it("passes the first bytes of a PPTX and rejects a PDF named .pptx", () => {
    const pptx = buildPptx();
    const pdf = buildPdf(1);
    expect(checkStoredFile("pptx", { size: pptx.length, contentType: pptxType, head: pptx.subarray(0, 8) })).toBeNull();
    expect(checkStoredFile("pptx", { size: pdf.length, contentType: pptxType, head: pdf.subarray(0, 8) })).toBe(
      "not_pptx",
    );
  });
});

describe("presentation check", () => {
  it("reads the entry names of a PPTX", () => {
    expect(entryNamesOf(buildPptx())).toEqual(presentationEntries);
    expect(isPresentation(presentationEntries)).toBe(true);
  });

  it("rejects a zip that is not a presentation", () => {
    const names = entryNamesOf(buildZip(["word/document.xml", "[Content_Types].xml"]));
    expect(names).not.toBeNull();
    expect(isPresentation(names ?? [])).toBe(false);
  });

  it("rejects a zip that only mentions the names in its comment", () => {
    const names = entryNamesOf(buildZip(["notes.txt"], "[Content_Types].xml ppt/presentation.xml"));
    expect(isPresentation(names ?? [])).toBe(false);
  });

  it("rejects a presentation with macros", () => {
    expect(isPresentation([...presentationEntries, "ppt/vbaProject.bin"])).toBe(false);
  });

  it("reads a directory larger than the tail window", () => {
    const manyEntries = [...presentationEntries, ...Array.from({ length: 1500 }, (_, index) => `ppt/media/image${index}.png`)];
    const zip = buildZip(manyEntries);
    const tail = zip.subarray(zip.length - deckLimits.zipTailBytes);
    const directory = findZipDirectory(tail, zip.length);
    expect(directory?.size).toBeGreaterThan(deckLimits.zipTailBytes);
    expect(entryNamesOf(zip)).toHaveLength(manyEntries.length);
  });

  it("finds no directory in a file that is not a zip", () => {
    expect(findZipDirectory(buildPdf(2), buildPdf(2).length)).toBeNull();
  });

  it("refuses a directory that does not sit right before its end record", () => {
    const zip = buildPptx();
    const tail = zip.subarray(zip.length - 22);
    expect(findZipDirectory(tail, zip.length + 10)).toBeNull();
  });

  it("refuses a directory that is cut short or has the wrong count", () => {
    const zip = buildPptx();
    const directory = findZipDirectory(zip, zip.length);
    const bytes = zip.subarray(directory!.offset, directory!.offset + directory!.size);
    expect(zipEntryNames(bytes.subarray(0, bytes.length - 3), directory!.entries)).toBeNull();
    expect(zipEntryNames(bytes, directory!.entries + 1)).toBeNull();
    expect(zipEntryNames(bytes, directory!.entries - 1)).toBeNull();
  });
});
