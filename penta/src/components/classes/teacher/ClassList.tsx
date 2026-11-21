import Link from "next/link";
import { countLabel } from "./helpers";
import styles from "./teacher.module.css";

export type ClassListItem = {
  id: string;
  code: string;
  title: string;
  section: string;
  term: string;
  studentCount: number;
  published: number;
  drafts: number;
};

export function lessonCounts(published: number, drafts: number): string {
  return `${published} published · ${countLabel(drafts, "draft", "drafts")}`;
}

export function ClassList({ classes }: { classes: ClassListItem[] }) {
  if (classes.length === 0) return <p className={styles.empty}>No classes yet. Create your first class.</p>;

  return (
    <ul className={styles.classGrid}>
      {classes.map((item) => (
        <li key={item.id}>
          <Link className={styles.cardLink} href={`/classes/${item.id}`}>
            <span className={styles.card}>
              <span className={styles.cardRow}>
                <span>{item.code}</span>
                {item.section && (
                  <span>
                    <span aria-hidden="true">[ </span>
                    {item.section}
                    <span aria-hidden="true"> ]</span>
                  </span>
                )}
              </span>
              <span className={styles.cardTitle}>{item.title}</span>
              <span className={styles.cardRow}>{lessonCounts(item.published, item.drafts)}</span>
              <span className={`${styles.cardRow} ${styles.cardFoot}`}>
                <span>{item.term || "No term set"}</span>
                <span>{countLabel(item.studentCount, "student", "students")}</span>
              </span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
