import { formatBytes } from "@/lib/decks";
import { checkChosenSubmission, submissionMessages } from "@/lib/submission-file";
import type { Submission } from "@/lib/submissions";

export type LateWarning = "none" | "new_late" | "replace_late";

export const handInText = {
  limits: "One file, PDF or DOCX, 25 MB or less.",
  dropHint: "PDF or DOCX, 25 MB or less.",
  noFile: "Choose a file first.",
  replaceNote: "The new file replaces the old one. Your teacher sees only the latest.",
  lateNew: "The due time has passed. Your file will be marked late.",
  lateReplace: "Your file was handed in on time. Replacing it now will mark it late.",
  confirmReplace: "Press Replace file again to go ahead.",
  starting: "Preparing the upload",
  finishing: "Checking the file",
  failed: "The upload failed. Check your connection and try again.",
  cancelled: "Upload cancelled.",
  noAnswer: "The server did not answer. Check your connection and try again.",
  handedIn: "Handed in",
  replaced: "File replaced",
  gradedLocked: "This work is graded, so the file cannot be replaced.",
  filesRemoved: "Your teacher removed the stored file after grading. Your score and feedback are kept.",
  needsScript: "Handing in a file needs JavaScript.",
} as const;

export function chosenProblem(file: { name: string; size: number }): string | null {
  const problem = checkChosenSubmission(file);
  return problem ? submissionMessages[problem] : null;
}

export function lateWarning(dueAt: string | null, current: { isLate: boolean } | null, now: number): LateWarning {
  if (dueAt === null || now < Date.parse(dueAt)) return "none";
  if (current === null) return "new_late";
  return current.isLate ? "none" : "replace_late";
}

export function uploadPercent(loadedBytes: number, fileBytes: number): number {
  if (fileBytes <= 0) return 0;
  return Math.floor((Math.min(Math.max(loadedBytes, 0), fileBytes) / fileBytes) * 100);
}

export function progressLabel(percent: number): string {
  return `Uploading ${percent}%`;
}

export function submitLabel(replacing: boolean): "Hand in" | "Replace file" {
  return replacing ? "Replace file" : "Hand in";
}

export function fileFacts(submission: Pick<Submission, "fileKind" | "sizeBytes">): string {
  return `${submission.fileKind} · ${formatBytes(submission.sizeBytes)}`;
}

export function scoreText(score: number, points: number): string {
  return `${score} of ${points}`;
}
