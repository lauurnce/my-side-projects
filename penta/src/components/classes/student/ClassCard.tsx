import Link from "next/link";
import { formatMeters, progressPercent, type ClassProgress, type StudentClassSummary } from "@/lib/classes";
import styles from "./ClassCard.module.css";

export type ClassCardProps = StudentClassSummary & Pick<ClassProgress, "done" | "published"> & { meters: number };

export function ClassCard({ id, code, section, term, title, teacherName, done, published, meters }: ClassCardProps) {
  const altitude = formatMeters(meters);
  return (
    <Link className={styles.link} href={`/classes/${id}`}>
      <span className={styles.card}>
        <span className={styles.row}>
          <span>{code}</span>
          {section ? (
            <span>
              <span aria-hidden="true">[ </span>
              {section}
              <span aria-hidden="true"> ]</span>
            </span>
          ) : null}
        </span>
        <span className={styles.title}>{title}</span>
        <span className={styles.progress}>
          <span className={styles.track} aria-hidden="true">
            <span className={styles.fill} data-fill="" style={{ width: `${progressPercent({ done, published })}%` }} />
          </span>
          <span className={styles.counts}>
            <span>
              {done} of {published} lessons
            </span>
            <span>
              <span aria-hidden="true">{altitude} m</span>
              <span className="visually-hidden">{altitude} meters</span>
            </span>
          </span>
        </span>
        <span className={styles.foot}>
          <span>
            <span className={styles.key}>Teacher </span>
            <span className={styles.teacher}>{teacherName}</span>
          </span>
          {term ? <span>{term}</span> : null}
        </span>
      </span>
    </Link>
  );
}
