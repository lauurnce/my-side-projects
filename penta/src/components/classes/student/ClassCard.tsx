import Link from "next/link";
import type { StudentClassSummary } from "@/lib/classes";
import styles from "./ClassCard.module.css";

export function ClassCard({ id, code, section, term, title, teacherName }: StudentClassSummary) {
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
