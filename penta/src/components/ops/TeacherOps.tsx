import Link from "next/link";
import { runBuilderAction } from "@/app/ops/builder-actions";
import { runUploadAction } from "@/app/ops/grading-actions";
import teacherStyles from "@/components/classes/teacher/teacher.module.css";
import { BracketLabel } from "@/components/ui/BracketLabel";
import type { CurrentUser } from "@/lib/auth";
import { formatManilaDateTime } from "@/lib/manila-time";
import { loadClassActivities, type Activity } from "@/lib/quiz";
import { createClient } from "@/lib/supabase/server";
import { pointsLabel } from "./builder/labels";
import { NewQuizForm } from "./teacher-ops/NewQuizForm";
import { NewUploadForm } from "./teacher-ops/NewUploadForm";
import { OpsList, activityCountLabel, type OpsRow } from "./teacher-ops/OpsList";
import styles from "./teacher-ops/ops.module.css";

export type TeacherOpsProps = { user: CurrentUser; classId: string };

function toOpsRow(activity: Activity): OpsRow {
  const due = formatManilaDateTime(activity.dueAt);
  return {
    id: activity.id,
    title: activity.title,
    kind: activity.type === "upload" ? "Upload" : "Quiz",
    published: activity.publishedAt !== null,
    points: pointsLabel(activity.points),
    due: due ? `Due ${due}` : "No due date",
  };
}

export async function TeacherOps({ classId }: TeacherOpsProps) {
  const supabase = await createClient();
  const activities = await loadClassActivities(supabase, classId);

  return (
    <section className={teacherStyles.section} aria-labelledby="ops-title">
      <div className={teacherStyles.sectionHead}>
        <h2 id="ops-title" className={teacherStyles.sectionTitle}>
          Ops
        </h2>
        <div className={styles.headLinks}>
          <BracketLabel>{activityCountLabel(activities.length)}</BracketLabel>
          <Link className={teacherStyles.back} href={`/classes/${classId}/grades`}>
            Gradebook
          </Link>
        </div>
      </div>
      <OpsList rows={activities.map(toOpsRow)} />
      <NewQuizForm classId={classId} action={runBuilderAction} />
      <NewUploadForm classId={classId} action={runUploadAction} />
    </section>
  );
}
