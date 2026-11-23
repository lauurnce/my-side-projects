import "server-only";
import { inflateRawSync } from "node:zlib";
import { deckLimits, submissionLimits, submissionUpload } from "@/lib/config";
import { findZipDirectory, localDataOffset, localHeaderLength, zipEntries, type ZipEntry } from "@/lib/deck-file";
import { readRange, storedFile } from "@/lib/stored-file";
import {
  checkStoredSubmission,
  declaresMacros,
  hasPdfEnd,
  isWordDocument,
  type SubmissionKind,
  type SubmissionProblem,
} from "@/lib/submission-file";
import { createAdminClient } from "@/lib/supabase/admin";

export type SubmissionInspection =
  | { status: "ok"; bytes: number; etag: string }
  | { status: "incomplete" }
  | { status: "unavailable" }
  | { status: "invalid"; problem: SubmissionProblem };

export type SubmissionUploadTarget = { url: string; contentType: string };

type Verdict = SubmissionProblem | null | "unavailable";

const bucket = "submissions";
const headBytes = 8;
const contentTypesName = "[Content_Types].xml";

function storage() {
  return createAdminClient().storage.from(bucket);
}

export function kindOfMime(mime: string): SubmissionKind | null {
  if (mime === submissionUpload.mimeTypeByExtension.pdf) return "pdf";
  return mime === submissionUpload.mimeTypeByExtension.docx ? "docx" : null;
}

export async function signSubmissionUpload(path: string, mime: string): Promise<SubmissionUploadTarget | null> {
  const { data } = await storage().createSignedUploadUrl(path);
  return data ? { url: data.signedUrl, contentType: mime } : null;
}

async function pdfVerdict(path: string, size: number): Promise<Verdict> {
  const tail = await readRange(bucket, path, Math.max(0, size - submissionLimits.pdfTailBytes), size - 1);
  if (!tail) return "unavailable";
  return hasPdfEnd(tail) ? null : "not_pdf";
}

async function readEntryText(path: string, entry: ZipEntry): Promise<string | null | "unavailable"> {
  if (entry.compressedSize < 1 || entry.compressedSize > submissionLimits.contentTypesMaxBytes) return null;
  const header = await readRange(bucket, path, entry.localOffset, entry.localOffset + localHeaderLength - 1);
  if (!header) return "unavailable";
  const dataStart = localDataOffset(header, entry.localOffset);
  if (dataStart === null) return null;
  const data = await readRange(bucket, path, dataStart, dataStart + entry.compressedSize - 1);
  if (!data) return "unavailable";
  if (entry.method === 0) return new TextDecoder().decode(data);
  if (entry.method !== 8) return null;
  try {
    return inflateRawSync(data, { maxOutputLength: submissionLimits.contentTypesMaxBytes }).toString("utf8");
  } catch {
    return null;
  }
}

async function docxVerdict(path: string, size: number): Promise<Verdict> {
  const tail = await readRange(bucket, path, Math.max(0, size - deckLimits.zipTailBytes), size - 1);
  if (!tail) return "unavailable";
  const directory = findZipDirectory(tail, size);
  if (!directory) return "not_docx";
  const directoryBytes = await readRange(bucket, path, directory.offset, directory.offset + directory.size - 1);
  if (!directoryBytes) return "unavailable";
  const entries = zipEntries(directoryBytes, directory.entries);
  if (!entries) return "not_docx";
  const names = entries.map((entry) => entry.name);
  if (!isWordDocument(names)) return "not_docx";

  const contentTypes = await readEntryText(path, entries.find((entry) => entry.name === contentTypesName)!);
  if (contentTypes === "unavailable") return "unavailable";
  if (contentTypes === null) return "not_docx";
  return declaresMacros(names, contentTypes) ? "has_macros" : null;
}

export async function inspectSubmission(path: string, kind: SubmissionKind): Promise<SubmissionInspection> {
  try {
    const stored = await storedFile(bucket, path);
    if (stored === "unavailable") return { status: "unavailable" };
    if (!stored) return { status: "incomplete" };
    if (stored.size < headBytes) return { status: "invalid", problem: stored.size < 1 ? "empty" : `not_${kind}` };

    const head = await readRange(bucket, path, 0, headBytes - 1);
    if (!head) return { status: "unavailable" };
    const problem = checkStoredSubmission(kind, { ...stored, head });
    if (problem) return { status: "invalid", problem };

    const verdict = kind === "pdf" ? await pdfVerdict(path, stored.size) : await docxVerdict(path, stored.size);
    if (verdict === "unavailable") return { status: "unavailable" };
    return verdict ? { status: "invalid", problem: verdict } : { status: "ok", bytes: stored.size, etag: stored.etag };
  } catch {
    return { status: "unavailable" };
  }
}

export async function signSubmissionFile(path: string, fileName: string): Promise<string | null> {
  const { data } = await storage().createSignedUrl(path, submissionLimits.fileUrlSeconds, { download: fileName });
  return data?.signedUrl ?? null;
}

export async function removeSubmissionFile(path: string | null | undefined): Promise<boolean> {
  if (!path) return true;
  const { error } = await storage().remove([path]);
  return !error;
}

export async function sweepSubmissions(): Promise<number> {
  const { data } = await createAdminClient().rpc("sweep_submissions");
  const names = data ?? [];
  if (names.length === 0) return 0;
  const { error } = await storage().remove(names);
  return error ? 0 : names.length;
}
