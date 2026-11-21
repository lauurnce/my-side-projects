import Link from "next/link";
import { BracketLabel } from "@/components/ui/BracketLabel";
import { classProgress } from "@/lib/classes";
import type { ClassOutline } from "@/lib/routes";
import { ContinueBlock, OutlineList, ProgressBlock } from "./ClassOutline";
import styles from "./student.module.css";

export type ClassDetailProps = {
  classId: string;
  code: string;
  section: string;
  term: string;
  title: string;
  teacherName: string;
  joinedOn: string | null;
  outline: ClassOutline;
};

export function ClassDetail({ classId, code, section, term, title, teacherName, joinedOn, outline }: ClassDetailProps) {
  const progress = classProgress(outline);
  const hasLessons = progress.published > 0;

  return (
    <div className={styles.page}>
      <Link className={styles.back} href="/classes">
        Back to your classes
      </Link>
      <header className={styles.header}>
        <p className={styles.labels}>
          <span>{code}</span>
          {section ? <BracketLabel>{section}</BracketLabel> : null}
          {term ? <span>{term}</span> : null}
        </p>
        <h1 className={styles.heading}>{title}</h1>
        <dl className={styles.facts}>
          <div>
            <dt>Teacher</dt>
            <dd>{teacherName}</dd>
          </div>
          {joinedOn ? (
            <div>
              <dt>Enrollment</dt>
              <dd>Joined on {joinedOn}</dd>
            </div>
          ) : null}
        </dl>
      </header>
      {hasLessons ? (
        <div className={styles.status}>
          <ProgressBlock {...progress} />
          <ContinueBlock classId={classId} next={progress.next} />
        </div>
      ) : null}
      <OutlineList classId={classId} outline={outline} />
      <p className={styles.later}>Decks and activities arrive in a later update.</p>
    </div>
  );
}
