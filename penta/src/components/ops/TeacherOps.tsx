import { runBuilderAction } from "@/app/ops/builder-actions";
import teacherStyles from "@/components/classes/teacher/teacher.module.css";
import { BracketLabel } from "@/components/ui/BracketLabel";
import type { CurrentUser } from "@/lib/auth";
import { formatManilaDateTime } from "@/lib/manila-time";
import { loadClassActivities, type Activity } from "@/lib/quiz";
import { createClient } from "@/lib/supabase/server";
import { pointsLabel } from "./builder/labels";
import { NewQuizForm } from "./teacher-ops/NewQuizForm";
import { OpsList, quizCountLabel, type OpsRow } from "./teacher-ops/OpsList";

export type TeacherOpsProps = { user: CurrentUser; classId: string };

function toOpsRow(activity: Activity): OpsRow {
  const due = formatManilaDateTime(activity.dueAt);
  return {
    id: activity.id,
    title: activity.title,
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
        <BracketLabel>{quizCountLabel(activities.length)}</BracketLabel>
      </div>
      <OpsList rows={activities.map(toOpsRow)} />
      <NewQuizForm classId={classId} action={runBuilderAction} />
    </section>
  );
}
