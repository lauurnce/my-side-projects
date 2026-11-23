import { deckLimits, storagePlan } from "@/lib/config";
import { formatBytes } from "@/lib/decks";
import { formatManilaDateTime, lateLabel } from "@/lib/manila-time";
import type { Activity } from "@/lib/quiz";
import { submissionState, type GradeLogEntry, type Submission, type SubmissionState } from "@/lib/submissions";
import type { Status } from "@/components/ui/StatusChip";

export const gradingNotes = {
  dueDate: "Manila time. Work handed in at or after this minute is marked late.",
  instructions: "Markdown. Students read this before they hand in.",
  hasWork: "Students have handed in work, so this activity cannot be unpublished or deleted.",
  deleteWarning: "This removes the activity. It cannot be undone.",
  noStudents: "No students are enrolled yet. Share the class code so they can join.",
  rosterFailed: "Could not load the roster",
  notScanned:
    "Student files are not virus scanned. Open them in the browser or in a protected view, and do not enable editing or content.",
  fileRemoved: "File removed after grading",
  storageUnknown: "Storage use could not be loaded.",
  storageAlmostFull: "Storage is almost full. Remove the files of graded work you no longer need.",
  removeFiles: "Scores and feedback stay. The files cannot be brought back.",
} as const;

export const removedStudentName = "Removed student";
export const otherTeacherName = "Another teacher";

export type RosterStudent = { studentId: string; fullName: string };

export type Grader = { id: string; fullName: string };

export type GradeRecord = { headline: string; history: string[] };

export type RowFile = {
  name: string;
  detail: string;
  handedIn: string;
  href: string | null;
};

export type GradingRow = {
  studentId: string;
  name: string;
  state: SubmissionState;
  lateText: string | null;
  submission: Submission | null;
  file: RowFile | null;
  record: GradeRecord | null;
};

export type SummaryCounts = { handedIn: number; graded: number; late: number; notHandedIn: number };

export type SubmissionStorage = { submissionBytes: number; totalBytes: number; blockBytes: number };

const stateChips: Record<SubmissionState, { status: Status; word: string }> = {
  not_handed_in: { status: "due", word: "Not handed in" },
  missing: { status: "due", word: "Missing" },
  handed_in: { status: "submitted", word: "Submitted" },
  graded: { status: "graded", word: "Graded" },
};

export function stateChip(state: SubmissionState): { status: Status; word: string } {
  return stateChips[state];
}

export function filePath(activityId: string, submissionId: string): string {
  return `/ops/${activityId}/submission/${submissionId}/file`;
}

function graderName(gradedBy: string | null, grader: Grader): string {
  return gradedBy === grader.id ? grader.fullName : otherTeacherName;
}

function byAndWhen(gradedBy: string | null, gradedAt: string | null, grader: Grader): string {
  return `by ${graderName(gradedBy, grader)}, ${formatManilaDateTime(gradedAt) ?? "time unknown"}`;
}

export function historySentence(entry: GradeLogEntry, grader: Grader): string {
  const tail = byAndWhen(entry.gradedBy, entry.gradedAt, grader);
  if (entry.oldScore === null) return `First score ${entry.newScore} ${tail}`;
  return `Changed from ${entry.oldScore} to ${entry.newScore} ${tail}`;
}

export function gradeRecord(submission: Submission, entries: GradeLogEntry[], grader: Grader): GradeRecord | null {
  if (!submission.gradedAt) return null;
  return {
    headline: `Graded ${byAndWhen(submission.gradedBy, submission.gradedAt, grader)}`,
    history: entries.length > 1 ? entries.map((entry) => historySentence(entry, grader)) : [],
  };
}

function rowFile(activityId: string, submission: Submission): RowFile {
  const open = submission.hasFile && !submission.filesRemovedAt;
  return {
    name: submission.fileName,
    detail: `${submission.fileKind} · ${formatBytes(submission.sizeBytes)}`,
    handedIn: `Handed in ${formatManilaDateTime(submission.submittedAt) ?? "at an unknown time"}`,
    href: open ? filePath(activityId, submission.id) : null,
  };
}

function lateText(activity: Activity, submission: Submission | null): string | null {
  if (!submission?.isLate) return null;
  return lateLabel(submission.submittedAt, activity.dueAt) ?? "Late";
}

export function buildRows(
  activity: Activity,
  roster: RosterStudent[],
  submissions: Submission[],
  log: GradeLogEntry[],
  grader: Grader,
  now: number,
): GradingRow[] {
  const byStudent = new Map(submissions.map((submission) => [submission.studentId, submission]));
  const enrolled = new Set(roster.map((student) => student.studentId));
  const removed = submissions
    .filter((submission) => !enrolled.has(submission.studentId))
    .map((submission) => ({ studentId: submission.studentId, fullName: removedStudentName }));
  const sorted = [...roster].sort((a, b) => a.fullName.localeCompare(b.fullName, "en"));

  return [...sorted, ...removed].map((student) => {
    const submission = byStudent.get(student.studentId) ?? null;
    const entries = submission ? log.filter((entry) => entry.submissionId === submission.id) : [];
    return {
      studentId: student.studentId,
      name: student.fullName,
      state: submissionState(activity, submission, now),
      lateText: lateText(activity, submission),
      submission,
      file: submission ? rowFile(activity.id, submission) : null,
      record: submission ? gradeRecord(submission, entries, grader) : null,
    };
  });
}

export function summaryCounts(rows: GradingRow[]): SummaryCounts {
  const handedIn = rows.filter((row) => row.submission !== null);
  return {
    handedIn: handedIn.length,
    graded: rows.filter((row) => row.state === "graded").length,
    late: handedIn.filter((row) => row.submission?.isLate).length,
    notHandedIn: rows.length - handedIn.length,
  };
}

export function summaryLine({ handedIn, graded, late, notHandedIn }: SummaryCounts): string {
  return `${handedIn} handed in · ${graded} graded · ${late} late · ${notHandedIn} not handed in`;
}

export function toSubmissionStorage(value: unknown): SubmissionStorage | null {
  if (typeof value !== "object" || value === null) return null;
  const { submission_bytes, total_bytes, block_bytes } = value as Record<string, unknown>;
  if (typeof submission_bytes !== "number" || typeof total_bytes !== "number") return null;
  return {
    submissionBytes: submission_bytes,
    totalBytes: total_bytes,
    blockBytes: typeof block_bytes === "number" && block_bytes > 0 ? block_bytes : storagePlan.blockBytes,
  };
}

function sizeLabel(bytes: number): string {
  return bytes > 0 ? formatBytes(bytes) : "0 MB";
}

export function storageLine({ submissionBytes, totalBytes, blockBytes }: SubmissionStorage): string {
  return `Submissions use ${sizeLabel(submissionBytes)}. Total storage: ${sizeLabel(totalBytes)} of ${formatBytes(blockBytes)}.`;
}

export function isStorageAlmostFull({ totalBytes, blockBytes }: SubmissionStorage): boolean {
  return totalBytes >= blockBytes * deckLimits.nearlyFullRatio;
}
