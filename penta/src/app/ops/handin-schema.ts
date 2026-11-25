import { z } from "zod";
import { submissionMessages } from "@/lib/submission-file";
import type { SubmissionInspection, SubmissionUploadTarget } from "@/lib/submission-storage";

export type HandInFailure = { status: "error"; message: string };
export type StartHandInResult = { status: "ok"; uploadId: string; target: SubmissionUploadTarget } | HandInFailure;
export type HandInStepResult = { status: "ok" } | HandInFailure;

export type ReserveStep = { step: "sign"; uploadId: string } | { step: "stop"; message: string };

export type InspectionStep =
  | { step: "complete"; bytes: number; etag: string }
  | { step: "keep"; message: string }
  | { step: "remove"; message: string };

export type CompletionStep =
  | { step: "done"; oldPath: string | null }
  | { step: "keep"; message: string }
  | { step: "remove"; path: string | null; message: string };

export const handInMessages = {
  notAvailable: "This activity is not available.",
  badFile: "That file could not be read. Choose it again.",
  graded: "This work is already graded, so the file cannot be replaced.",
  full: "Storage is full, so new files cannot be accepted right now. Tell your teacher.",
  storageUnavailable: "Storage is not available right now. Try again in a moment.",
  replaced: "This upload was replaced by a newer one, or it is already finished.",
  incomplete: "The upload did not finish. Try again.",
  grew: "The uploaded file is larger than the file you chose. Upload it again.",
  failed: "The file could not be handed in. Try again.",
  gone: "This activity is no longer open to you, so the file was not handed in.",
} as const;

export const startHandInSchema = z.object({
  activityId: z.uuid(),
  file: z.object({ name: z.string().min(1).max(300), size: z.number() }),
});

export const uploadTargetSchema = z.object({ uploadId: z.uuid() });

const reserveReplySchema = z.object({ status: z.string(), upload_id: z.uuid().nullish() });

const completeReplySchema = z.object({
  status: z.string(),
  old_path: z.string().nullish(),
  file_path: z.string().nullish(),
});

const reserveMessages: Record<string, string> = {
  not_found: handInMessages.notAvailable,
  bad_kind: submissionMessages.wrong_extension,
  too_large: submissionMessages.too_large,
  graded: handInMessages.graded,
  full: handInMessages.full,
};

export function handInFailure(message: string): HandInFailure {
  return { status: "error", message };
}

export function startInputMessage(error: z.ZodError): string {
  const activityIssue = error.issues.some((issue) => issue.path[0] === "activityId");
  return activityIssue ? handInMessages.notAvailable : handInMessages.badFile;
}

export function reserveStep(reply: unknown): ReserveStep {
  const parsed = reserveReplySchema.safeParse(reply);
  if (!parsed.success) return { step: "stop", message: handInMessages.failed };
  const { status, upload_id: uploadId } = parsed.data;
  if (status === "reserved" && uploadId) return { step: "sign", uploadId };
  return { step: "stop", message: reserveMessages[status] ?? handInMessages.failed };
}

export function inspectionStep(inspection: SubmissionInspection): InspectionStep {
  if (inspection.status === "ok") return { step: "complete", bytes: inspection.bytes, etag: inspection.etag };
  if (inspection.status === "invalid") return { step: "remove", message: submissionMessages[inspection.problem] };
  if (inspection.status === "incomplete") return { step: "keep", message: handInMessages.incomplete };
  return { step: "keep", message: handInMessages.storageUnavailable };
}

export function completionStep(reply: unknown): CompletionStep {
  const parsed = completeReplySchema.safeParse(reply);
  if (!parsed.success) return { step: "keep", message: handInMessages.failed };
  const { status, old_path: oldPath, file_path: filePath } = parsed.data;
  if (status === "completed") return { step: "done", oldPath: oldPath ?? null };
  if (status === "too_large") return { step: "remove", path: filePath ?? null, message: handInMessages.grew };
  if (status === "graded") return { step: "remove", path: filePath ?? null, message: handInMessages.graded };
  if (status === "gone") return { step: "remove", path: filePath ?? null, message: handInMessages.gone };
  if (status === "not_pending") return { step: "keep", message: handInMessages.replaced };
  return { step: "keep", message: handInMessages.failed };
}
