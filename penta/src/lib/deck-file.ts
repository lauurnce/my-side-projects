import { deckLimits, deckUpload } from "@/lib/config";

export type DeckFileKind = keyof typeof deckUpload.mimeTypeByExtension;

export type DeckFileProblem = "empty" | "too_large" | "wrong_extension" | "wrong_type" | "not_pdf" | "not_pptx";

export type ZipDirectory = { offset: number; size: number; entries: number };

export const storedFileName: Record<DeckFileKind, string> = { pdf: "slides.pdf", pptx: "original.pptx" };

export const deckFileMessages: Record<DeckFileProblem, Record<DeckFileKind, string>> = {
  empty: { pdf: "The PDF is empty.", pptx: "The PPTX is empty." },
  too_large: { pdf: "The PDF is larger than 50 MB.", pptx: "The PPTX is larger than 50 MB." },
  wrong_extension: { pdf: "Choose a file that ends in .pdf.", pptx: "Choose a file that ends in .pptx." },
  wrong_type: { pdf: "The PDF was stored with the wrong type.", pptx: "The PPTX was stored with the wrong type." },
  not_pdf: { pdf: "That file is not a PDF.", pptx: "That file is not a PDF." },
  not_pptx: {
    pdf: "That file is not a PowerPoint presentation.",
    pptx: "That file is not a PowerPoint presentation. Macro files (.pptm) are not accepted.",
  },
};

const pdfSignature = [0x25, 0x50, 0x44, 0x46, 0x2d];
const zipSignature = [0x50, 0x4b, 0x03, 0x04];
const directoryEndSignature = 0x06054b50;
const directoryEntrySignature = 0x02014b50;
const directoryEndLength = 22;
const directoryEntryLength = 46;
const requiredPresentationEntries = ["[Content_Types].xml", "ppt/presentation.xml"];
const refusedPresentationEntries = ["ppt/vbaProject.bin"];

function startsWith(bytes: Uint8Array, signature: number[]): boolean {
  return bytes.length >= signature.length && signature.every((value, index) => bytes[index] === value);
}

function viewOf(bytes: Uint8Array): DataView {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}

export function extensionOf(fileName: string): string {
  const dot = fileName.lastIndexOf(".");
  return dot < 0 ? "" : fileName.slice(dot + 1).toLowerCase();
}

export function checkChosenFile(kind: DeckFileKind, file: { name: string; size: number }): DeckFileProblem | null {
  if (extensionOf(file.name) !== kind) return "wrong_extension";
  if (!Number.isSafeInteger(file.size) || file.size < 1) return "empty";
  if (file.size > deckUpload.maxBytes) return "too_large";
  return null;
}

export function hasPdfSignature(head: Uint8Array): boolean {
  return startsWith(head, pdfSignature);
}

export function hasZipSignature(head: Uint8Array): boolean {
  return startsWith(head, zipSignature);
}

export function findZipDirectory(tail: Uint8Array, fileSize: number): ZipDirectory | null {
  const view = viewOf(tail);
  for (let start = tail.length - directoryEndLength; start >= 0; start -= 1) {
    if (view.getUint32(start, true) !== directoryEndSignature) continue;
    if (start + directoryEndLength + view.getUint16(start + 20, true) !== tail.length) continue;

    const entries = view.getUint16(start + 10, true);
    const size = view.getUint32(start + 12, true);
    const offset = view.getUint32(start + 16, true);
    const oneDisk = view.getUint16(start + 4, true) === 0 && view.getUint16(start + 6, true) === 0;
    const sameCount = view.getUint16(start + 8, true) === entries;
    const plainZip = entries !== 0xffff && size !== 0xffffffff && offset !== 0xffffffff;
    const endsAtRecord = offset + size === fileSize - (tail.length - start);
    const fits = size > 0 && size <= deckLimits.zipDirectoryMaxBytes;
    return oneDisk && sameCount && plainZip && endsAtRecord && fits ? { offset, size, entries } : null;
  }
  return null;
}

export function zipEntryNames(directory: Uint8Array, entries: number): string[] | null {
  const view = viewOf(directory);
  const decoder = new TextDecoder();
  const names: string[] = [];
  let position = 0;
  while (names.length < entries) {
    if (position + directoryEntryLength > directory.length) return null;
    if (view.getUint32(position, true) !== directoryEntrySignature) return null;
    const nameLength = view.getUint16(position + 28, true);
    const nameEnd = position + directoryEntryLength + nameLength;
    if (nameEnd > directory.length) return null;
    names.push(decoder.decode(directory.subarray(position + directoryEntryLength, nameEnd)));
    position = nameEnd + view.getUint16(position + 30, true) + view.getUint16(position + 32, true);
  }
  return position === directory.length ? names : null;
}

export type ZipEntry = { name: string; method: number; compressedSize: number; localOffset: number };

export function zipEntries(directory: Uint8Array, entries: number): ZipEntry[] | null {
  const view = viewOf(directory);
  const decoder = new TextDecoder();
  const listed: ZipEntry[] = [];
  let position = 0;
  while (listed.length < entries) {
    if (position + directoryEntryLength > directory.length) return null;
    if (view.getUint32(position, true) !== directoryEntrySignature) return null;
    const nameEnd = position + directoryEntryLength + view.getUint16(position + 28, true);
    if (nameEnd > directory.length) return null;
    listed.push({
      name: decoder.decode(directory.subarray(position + directoryEntryLength, nameEnd)),
      method: view.getUint16(position + 10, true),
      compressedSize: view.getUint32(position + 20, true),
      localOffset: view.getUint32(position + 42, true),
    });
    position = nameEnd + view.getUint16(position + 30, true) + view.getUint16(position + 32, true);
  }
  return position === directory.length ? listed : null;
}

export const localHeaderLength = 30;

export function localDataOffset(localHeader: Uint8Array, localOffset: number): number | null {
  if (localHeader.length < localHeaderLength || !hasZipSignature(localHeader)) return null;
  const view = viewOf(localHeader);
  return localOffset + localHeaderLength + view.getUint16(26, true) + view.getUint16(28, true);
}

export function isPresentation(entryNames: string[]): boolean {
  return (
    requiredPresentationEntries.every((name) => entryNames.includes(name)) &&
    !refusedPresentationEntries.some((name) => entryNames.includes(name))
  );
}

export function checkStoredFile(
  kind: DeckFileKind,
  stored: { size: number; contentType: string; head: Uint8Array },
): DeckFileProblem | null {
  if (stored.size < 1) return "empty";
  if (stored.size > deckUpload.maxBytes) return "too_large";
  if (stored.contentType !== deckUpload.mimeTypeByExtension[kind]) return "wrong_type";
  if (kind === "pdf") return hasPdfSignature(stored.head) ? null : "not_pdf";
  return hasZipSignature(stored.head) ? null : "not_pptx";
}
