import Link from "next/link";
import { DeckLibrary } from "@/components/decks/library/DeckLibrary";
import { liveDeckIds } from "@/components/decks/library/helpers";
import { BracketLabel } from "@/components/ui/BracketLabel";
import { classProgress } from "@/lib/classes";
import type { DeckSummary } from "@/lib/decks";
import type { LiveDeck } from "@/lib/live";
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
  decks: DeckSummary[];
  live?: LiveDeck[];
};

export function ClassDetail({
  classId,
  code,
  section,
  term,
  title,
  teacherName,
  joinedOn,
  outline,
  decks,
  live = [],
}: ClassDetailProps) {
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
      <DeckLibrary decks={decks} classCode={code} outline={outline} liveIds={liveDeckIds(live)} />
      <p className={styles.later}>Activities arrive in a later update.</p>
    </div>
  );
}
