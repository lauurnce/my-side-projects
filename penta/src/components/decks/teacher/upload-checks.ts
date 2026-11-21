import { deckLimits } from "@/lib/config";
import { checkChosenFile, deckFileMessages, type DeckFileKind } from "@/lib/deck-file";
import { formatBytes } from "@/lib/decks";

export const uploadMessages = {
  intro: "Upload a PDF. To share a PowerPoint, export it to PDF and add both files.",
  pdfHint: "PDF, 50 MB or less. This is what students see.",
  pptxHint: "Optional. The PowerPoint file students can download.",
  noPdf: "Choose a PDF file.",
  noTitle: "Enter a deck title",
  protectedPdf: "This PDF is password protected. Remove the password and try again.",
  brokenPdf: "This PDF could not be opened. Export it again and retry.",
  slowLoad: "Large decks load slowly for students on phones.",
  checking: "Checking the PDF",
  finishing: "Finishing the upload",
  failed: "The upload failed. Check your connection and try again.",
  cancelled: "Upload cancelled.",
  noAnswer: "The server did not answer. Check your connection and try again.",
  uploaded: "Deck uploaded",
  full: "Storage is full.",
} as const;

export type PageCheck = { ok: true; pages: number } | { ok: false; message: string };

export function openFailureMessage(error: unknown): string {
  const name = typeof error === "object" && error !== null ? (error as { name?: unknown }).name : null;
  return name === "PasswordException" ? uploadMessages.protectedPdf : uploadMessages.brokenPdf;
}

export function tooManyPagesMessage(pages: number): string {
  return `This PDF has ${pages} pages. A deck can have ${deckLimits.slidesMax} at most.`;
}

export function checkPageCount(pages: number): PageCheck {
  if (!Number.isInteger(pages) || pages < 1) return { ok: false, message: uploadMessages.brokenPdf };
  if (pages > deckLimits.slidesMax) return { ok: false, message: tooManyPagesMessage(pages) };
  return { ok: true, pages };
}

export function chosenFileProblem(kind: DeckFileKind, file: { name: string; size: number }): string | null {
  const problem = checkChosenFile(kind, file);
  return problem ? deckFileMessages[problem][kind] : null;
}

export function chosenFileLabel(file: { name: string; size: number }): string {
  return `${file.name}, ${formatBytes(file.size)}`;
}

export function loadsSlowly(file: { size: number } | null): boolean {
  return file !== null && file.size > deckLimits.slowLoadBytes;
}

export function uploadPercent(loadedBytes: number[], fileSizes: number[]): number {
  const total = fileSizes.reduce((sum, size) => sum + size, 0);
  if (total <= 0) return 0;
  const loaded = fileSizes.reduce((sum, size, index) => sum + Math.min(Math.max(loadedBytes[index] ?? 0, 0), size), 0);
  return Math.floor((loaded / total) * 100);
}

export function progressLabel(percent: number): string {
  return `Uploading ${percent}%`;
}
