import { submissionUpload } from "@/lib/config";
import { extensionOf, hasPdfSignature, hasZipSignature } from "@/lib/deck-file";

export type SubmissionKind = keyof typeof submissionUpload.mimeTypeByExtension;

export type SubmissionProblem =
  | "empty"
  | "too_large"
  | "wrong_extension"
  | "wrong_type"
  | "not_pdf"
  | "not_docx"
  | "has_macros";

export const submissionMessages: Record<SubmissionProblem, string> = {
  empty: "That file is empty.",
  too_large: "That file is larger than 25 MB.",
  wrong_extension: "Choose a file that ends in .pdf or .docx.",
  wrong_type: "The file was stored with the wrong type. Upload it again.",
  not_pdf: "That file is not a PDF. Export it again and retry.",
  not_docx: "That file is not a Word document. Save it as .docx and retry.",
  has_macros: "That document has macros. Save it as a plain .docx and retry.",
};

const pdfEndMarker = "%%EOF";
const requiredDocumentEntries = ["[Content_Types].xml", "word/document.xml"];
const macroMarkers = ["macroenabled", "vbaproject"];

export function submissionKindOf(fileName: string): SubmissionKind | null {
  const extension = extensionOf(fileName);
  return extension === "pdf" || extension === "docx" ? extension : null;
}

export function checkChosenSubmission(file: { name: string; size: number }): SubmissionProblem | null {
  if (!submissionKindOf(file.name)) return "wrong_extension";
  if (!Number.isSafeInteger(file.size) || file.size < 1) return "empty";
  if (file.size > submissionUpload.maxBytes) return "too_large";
  return null;
}

export function hasPdfEnd(tail: Uint8Array): boolean {
  return new TextDecoder("latin1").decode(tail).includes(pdfEndMarker);
}

export function isWordDocument(entryNames: string[]): boolean {
  return requiredDocumentEntries.every((name) => entryNames.includes(name));
}

export function declaresMacros(entryNames: string[], contentTypesXml: string): boolean {
  const lowered = contentTypesXml.toLowerCase();
  return (
    macroMarkers.some((marker) => lowered.includes(marker)) ||
    entryNames.some((name) => name.toLowerCase().endsWith("vbaproject.bin"))
  );
}

export function checkStoredSubmission(
  kind: SubmissionKind,
  stored: { size: number; contentType: string; head: Uint8Array },
): SubmissionProblem | null {
  if (stored.size < 1) return "empty";
  if (stored.size > submissionUpload.maxBytes) return "too_large";
  if (stored.contentType !== submissionUpload.mimeTypeByExtension[kind]) return "wrong_type";
  if (kind === "pdf") return hasPdfSignature(stored.head) ? null : "not_pdf";
  return hasZipSignature(stored.head) ? null : "not_docx";
}
