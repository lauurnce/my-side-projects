import "server-only";
import { deckLimits, deckUpload } from "@/lib/config";
import {
  checkStoredFile,
  findZipDirectory,
  isPresentation,
  zipEntryNames,
  type DeckFileKind,
  type DeckFileProblem,
} from "@/lib/deck-file";
import { readRange as readBucketRange, storedFile as storedBucketFile } from "@/lib/stored-file";
import { createAdminClient } from "@/lib/supabase/admin";

export type DeckPaths = { pdfPath: string; originalPath: string | null };

export type UploadTarget = { url: string; contentType: string };

export type UploadTargets = { pdf: UploadTarget; pptx: UploadTarget | null };

export type Inspection =
  | { status: "ok"; bytes: number }
  | { status: "incomplete" }
  | { status: "unavailable" }
  | { status: "invalid"; kind: DeckFileKind; problem: DeckFileProblem };

const bucket = "decks";
const headBytes = 8;

function storage() {
  return createAdminClient().storage.from(bucket);
}

async function signUpload(path: string, kind: DeckFileKind): Promise<UploadTarget | null> {
  const { data } = await storage().createSignedUploadUrl(path);
  return data ? { url: data.signedUrl, contentType: deckUpload.mimeTypeByExtension[kind] } : null;
}

export async function signDeckUploads(paths: DeckPaths): Promise<UploadTargets | null> {
  const pdf = await signUpload(paths.pdfPath, "pdf");
  if (!pdf) return null;
  if (!paths.originalPath) return { pdf, pptx: null };
  const pptx = await signUpload(paths.originalPath, "pptx");
  return pptx ? { pdf, pptx } : null;
}

function storedFile(path: string) {
  return storedBucketFile(bucket, path);
}

function readRange(path: string, start: number, end: number) {
  return readBucketRange(bucket, path, start, end);
}

async function presentationProblem(path: string, size: number): Promise<DeckFileProblem | null | "unavailable"> {
  const tailStart = Math.max(0, size - deckLimits.zipTailBytes);
  const tail = await readRange(path, tailStart, size - 1);
  if (!tail) return "unavailable";
  const directory = findZipDirectory(tail, size);
  if (!directory) return "not_pptx";
  const directoryBytes = await readRange(path, directory.offset, directory.offset + directory.size - 1);
  if (!directoryBytes) return "unavailable";
  const names = zipEntryNames(directoryBytes, directory.entries);
  return names && isPresentation(names) ? null : "not_pptx";
}

async function inspectFile(path: string, kind: DeckFileKind): Promise<Inspection> {
  const stored = await storedFile(path);
  if (stored === "unavailable") return { status: "unavailable" };
  if (!stored) return { status: "incomplete" };
  if (stored.size < headBytes) return { status: "invalid", kind, problem: stored.size < 1 ? "empty" : `not_${kind}` };

  const head = await readRange(path, 0, headBytes - 1);
  if (!head) return { status: "unavailable" };
  const problem = checkStoredFile(kind, { ...stored, head });
  if (problem) return { status: "invalid", kind, problem };
  if (kind === "pdf") return { status: "ok", bytes: stored.size };

  const zipProblem = await presentationProblem(path, stored.size);
  if (zipProblem === "unavailable") return { status: "unavailable" };
  return zipProblem ? { status: "invalid", kind, problem: zipProblem } : { status: "ok", bytes: stored.size };
}

export async function inspectDeckFiles(paths: DeckPaths): Promise<Inspection> {
  try {
    const pdf = await inspectFile(paths.pdfPath, "pdf");
    if (pdf.status !== "ok" || !paths.originalPath) return pdf;
    const pptx = await inspectFile(paths.originalPath, "pptx");
    return pptx.status === "ok" ? { status: "ok", bytes: pdf.bytes + pptx.bytes } : pptx;
  } catch {
    return { status: "unavailable" };
  }
}

export async function deckFileSize(path: string): Promise<number | null> {
  const stored = await storedFile(path);
  return stored && stored !== "unavailable" ? stored.size : null;
}

export async function signDeckView(pdfPath: string): Promise<string | null> {
  const { data } = await storage().createSignedUrl(pdfPath, deckLimits.viewUrlSeconds);
  return data?.signedUrl ?? null;
}

export async function signDeckDownload(path: string, fileName: string): Promise<string | null> {
  const { data } = await storage().createSignedUrl(path, deckLimits.downloadUrlSeconds, { download: fileName });
  return data?.signedUrl ?? null;
}

export async function removeDeckFiles(paths: { pdfPath: string | null; originalPath: string | null }): Promise<boolean> {
  const names = [paths.pdfPath, paths.originalPath].filter((path): path is string => path !== null);
  if (names.length === 0) return true;
  const { error } = await storage().remove(names);
  return !error;
}

export async function sweepDecks(): Promise<number> {
  const { data } = await createAdminClient().rpc("sweep_decks");
  const names = data ?? [];
  if (names.length === 0) return 0;
  const { error } = await storage().remove(names);
  return error ? 0 : names.length;
}
