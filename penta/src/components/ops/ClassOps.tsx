import { BracketLabel } from "@/components/ui/BracketLabel";
import { activityCountLabel, opsItems, type OpsData } from "./list/helpers";
import styles from "./list/list.module.css";
import { OpsCards } from "./list/OpsCards";

export type ClassOpsProps = OpsData & { classCode: string };

export function ClassOps({ classCode, activities, attempts, now, cells }: ClassOpsProps) {
  const items = opsItems({ activities, attempts, now, cells });

  return (
    <section className={styles.section} aria-labelledby="class-ops-title">
      <div className={styles.head}>
        <h2 id="class-ops-title" className={styles.heading}>
          Ops
        </h2>
        <BracketLabel>{activityCountLabel(items.length)}</BracketLabel>
      </div>
      {items.length === 0 ? (
        <p className={styles.empty}>No activities yet. Quizzes show up here when your teacher publishes one.</p>
      ) : (
        <OpsCards items={items} codeFor={() => classCode} />
      )}
    </section>
  );
}
