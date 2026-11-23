import type { SupabaseClient } from "@supabase/supabase-js";
import { submissionUpload } from "@/lib/config";
import type { Database } from "@/lib/database.types";
import type { Activity } from "@/lib/quiz";

type Supabase = SupabaseClient<Database>;
type SubmissionRow = Database["public"]["Tables"]["submissions"]["Row"];
type LogRow = Database["public"]["Tables"]["submission_grade_log"]["Row"];

export type Submission = {
  id: string;
  activityId: string;
  studentId: string;
  uploadId: string;
  hasFile: boolean;
  fileName: string;
  fileKind: "PDF" | "DOCX";
  sizeBytes: number;
  submittedAt: string;
  isLate: boolean;
  score: number | null;
  feedback: string | null;
  gradedAt: string | null;
  gradedBy: string | null;
  filesRemovedAt: string | null;
};

export type GradeLogEntry = {
  id: string;
  submissionId: string;
  oldScore: number | null;
  newScore: number;
  gradedBy: string;
  gradedAt: string;
};

export type SubmissionState = "not_handed_in" | "missing" | "handed_in" | "graded";

const submissionColumns =
  "id, activity_id, student_id, upload_id, file_path, file_name, mime, size_bytes, submitted_at, is_late, score, feedback, graded_at, graded_by, files_removed_at";

export function toSubmission(row: Omit<SubmissionRow, "file_etag">): Submission {
  return {
    id: row.id,
    activityId: row.activity_id,
    studentId: row.student_id,
    uploadId: row.upload_id,
    hasFile: row.file_path !== null,
    fileName: row.file_name,
    fileKind: row.mime === submissionUpload.mimeTypeByExtension.pdf ? "PDF" : "DOCX",
    sizeBytes: row.size_bytes,
    submittedAt: row.submitted_at,
    isLate: row.is_late,
    score: row.score,
    feedback: row.feedback,
    gradedAt: row.graded_at,
    gradedBy: row.graded_by,
    filesRemovedAt: row.files_removed_at,
  };
}

export function toGradeLogEntry(
  row: Pick<LogRow, "id" | "submission_id" | "old_score" | "new_score" | "graded_by" | "graded_at">,
): GradeLogEntry {
  return {
    id: row.id,
    submissionId: row.submission_id,
    oldScore: row.old_score,
    newScore: row.new_score,
    gradedBy: row.graded_by,
    gradedAt: row.graded_at,
  };
}

export function submissionState(activity: Activity, submission: Submission | null, now: number): SubmissionState {
  if (submission?.gradedAt) return "graded";
  if (submission) return "handed_in";
  return activity.dueAt !== null && now >= new Date(activity.dueAt).getTime() ? "missing" : "not_handed_in";
}

export function submissionDownloadName(studentName: string, activityTitle: string, fileKind: Submission["fileKind"]): string {
  const base = `${studentName}-${activityTitle}`
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    .replace(/-+$/, "");
  return `${base || "submission"}.${fileKind === "PDF" ? "pdf" : "docx"}`;
}

export async function loadOwnSubmission(
  supabase: Supabase,
  activityId: string,
  studentId: string,
): Promise<Submission | null> {
  const { data } = await supabase
    .from("submissions")
    .select(submissionColumns)
    .eq("activity_id", activityId)
    .eq("student_id", studentId)
    .maybeSingle();
  return data ? toSubmission(data) : null;
}

export async function loadActivitySubmissions(supabase: Supabase, activityId: string): Promise<Submission[]> {
  const { data } = await supabase
    .from("submissions")
    .select(submissionColumns)
    .eq("activity_id", activityId)
    .order("submitted_at");
  return (data ?? []).map(toSubmission);
}

export async function loadGradeLog(supabase: Supabase, activityId: string): Promise<GradeLogEntry[]> {
  const { data } = await supabase
    .from("submission_grade_log")
    .select("id, submission_id, old_score, new_score, graded_by, graded_at")
    .eq("activity_id", activityId)
    .order("graded_at");
  return (data ?? []).map(toGradeLogEntry);
}
