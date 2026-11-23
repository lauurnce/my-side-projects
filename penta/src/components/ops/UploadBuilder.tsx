import Link from "next/link";
import { gradeSubmission, runUploadAction, saveUploadSettings } from "@/app/ops/grading-actions";
import { uploadSettingsValues } from "@/app/ops/grading-schema";
import { toRosterRows } from "@/components/classes/teacher/helpers";
import teacherStyles from "@/components/classes/teacher/teacher.module.css";
import { lessonGroups } from "@/components/decks/teacher/labels";
import { BracketLabel } from "@/components/ui/BracketLabel";
import { StatusChip } from "@/components/ui/StatusChip";
import type { CurrentUser } from "@/lib/auth";
import type { Activity } from "@/lib/quiz";
import { loadClassOutline } from "@/lib/routes";
import { sweepSubmissions } from "@/lib/submission-storage";
import { loadActivitySubmissions, loadGradeLog } from "@/lib/submissions";
import { createClient } from "@/lib/supabase/server";
import { pointsLabel, statusWord } from "./builder/labels";
import builderStyles from "./builder/builder.module.css";
import { buildRows, toSubmissionStorage, type RosterStudent, type SubmissionStorage } from "./grading/helpers";
import { StoragePanel } from "./grading/StoragePanel";
import { SubmissionList } from "./grading/SubmissionList";
import { UploadActions } from "./grading/UploadActions";
import { UploadSettingsForm } from "./grading/UploadSettingsForm";

export type UploadBuilderProps = { user: CurrentUser; activity: Activity };

type Supabase = Awaited<ReturnType<typeof createClient>>;

function requestTime(): number {
  return Date.now();
}

async function loadRoster(supabase: Supabase, classId: string): Promise<RosterStudent[] | null> {
  const { data: enrollments, error } = await supabase
    .from("enrollments")
    .select("student_id, joined_at")
    .eq("class_id", classId);
  if (error) return null;
  if (enrollments.length === 0) return [];

  const { data: profiles, error: profilesError } = await supabase
    .from("profiles")
    .select("id, full_name")
    .in(
      "id",
      enrollments.map((enrollment) => enrollment.student_id),
    );
  if (profilesError) return null;

  return toRosterRows(enrollments, profiles);
}

async function loadSubmissionStorage(supabase: Supabase): Promise<SubmissionStorage | null> {
  const { data } = await supabase.rpc("storage_usage");
  return toSubmissionStorage(data);
}

export async function UploadBuilder({ user, activity }: UploadBuilderProps) {
  await sweepSubmissions();
  const supabase = await createClient();
  const [submissions, log, roster, outline, storage] = await Promise.all([
    loadActivitySubmissions(supabase, activity.id),
    loadGradeLog(supabase, activity.id),
    loadRoster(supabase, activity.classId),
    loadClassOutline(supabase, activity.classId, user.id),
    loadSubmissionStorage(supabase),
  ]);
  const published = activity.publishedAt !== null;
  const rows = roster && buildRows(activity, roster, submissions, log, user, requestTime());

  return (
    <div className={teacherStyles.page}>
      <Link className={teacherStyles.back} href={`/classes/${activity.classId}`}>
        Back to the class
      </Link>
      <header className={builderStyles.head}>
        <div className={builderStyles.headLabels}>
          <BracketLabel>Layer 03 · Ops</BracketLabel>
          <BracketLabel>Upload</BracketLabel>
          <StatusChip status={published ? "submitted" : "due"}>{statusWord(published)}</StatusChip>
        </div>
        <h1 className={builderStyles.title} dir="auto">
          {activity.title}
        </h1>
        <p className={builderStyles.summary}>{pointsLabel(activity.points)}</p>
        <Link className={teacherStyles.back} href={`/classes/${activity.classId}/grades`}>
          Gradebook
        </Link>
      </header>
      <UploadSettingsForm
        key={activity.id}
        activityId={activity.id}
        values={uploadSettingsValues(activity)}
        lessons={lessonGroups(outline)}
        pointsLocked={submissions.some((submission) => submission.gradedAt !== null)}
        action={saveUploadSettings}
      />
      <UploadActions
        activityId={activity.id}
        published={published}
        hasWork={submissions.length > 0}
        action={runUploadAction}
      />
      <SubmissionList rows={rows} points={activity.points} gradeAction={gradeSubmission} />
      <StoragePanel activityId={activity.id} storage={storage} action={runUploadAction} />
    </div>
  );
}
