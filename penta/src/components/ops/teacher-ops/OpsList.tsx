import Link from "next/link";
import outlineStyles from "@/components/classes/teacher/outline/outline.module.css";
import teacherStyles from "@/components/classes/teacher/teacher.module.css";
import { StatusChip } from "@/components/ui/StatusChip";
import styles from "./ops.module.css";

export type OpsRow = {
  id: string;
  title: string;
  kind: "Quiz" | "Upload";
  published: boolean;
  points: string;
  due: string;
};

export const emptyOpsMessage = "No activities yet. Create a quiz or an upload activity.";

export function activityCountLabel(count: number): string {
  return `${count} ${count === 1 ? "activity" : "activities"}`;
}

export function OpsList({ rows }: { rows: OpsRow[] }) {
  if (rows.length === 0) return <p className={teacherStyles.empty}>{emptyOpsMessage}</p>;

  return (
    <ul className={styles.list}>
      {rows.map((row) => (
        <li key={row.id} className={outlineStyles.lesson}>
          <div className={outlineStyles.lessonInfo}>
            <Link prefetch={false} className={outlineStyles.lessonTitle} href={`/ops/${row.id}`} dir="auto">
              {row.title}
            </Link>
            <div className={outlineStyles.meta}>
              <span className={outlineStyles.minutes}>{row.kind}</span>
              <StatusChip status={row.published ? "submitted" : "due"}>
                {row.published ? "Published" : "Draft"}
              </StatusChip>
              <span className={outlineStyles.minutes}>{row.points}</span>
              <span className={outlineStyles.minutes}>{row.due}</span>
            </div>
          </div>
          {row.kind === "Quiz" && (
            <div className={outlineStyles.actions}>
              <Link prefetch={false}
                className={outlineStyles.button}
                href={`/ops/${row.id}/results`}
                aria-label={`Results of ${row.title}`}
              >
                Results
              </Link>
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}
