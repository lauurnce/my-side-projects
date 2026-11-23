import Link from "next/link";
import { DeckLibrary } from "@/components/decks/library/DeckLibrary";
import { liveDeckIds } from "@/components/decks/library/helpers";
import { basisNote, breakdownText } from "@/components/grades/altitude/helpers";
import { ClassOps } from "@/components/ops/ClassOps";
import type { OpsData } from "@/components/ops/list/helpers";
import { BracketLabel } from "@/components/ui/BracketLabel";
import { classProgress } from "@/lib/classes";
import type { DeckSummary } from "@/lib/decks";
import type { ClassAltitude } from "@/lib/grades";
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
  ops?: OpsData;
  altitude?: ClassAltitude | null;
};

const noOps: OpsData = { activities: [], attempts: [], now: 0 };

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
  ops = noOps,
  altitude = null,
}: ClassDetailProps) {
  const progress = classProgress(outline);
  const hasLessons = progress.published > 0;
  const counts = altitude?.counts === true;

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
      {hasLessons || counts ? (
        <div className={styles.status}>
          <ProgressBlock
            done={progress.done}
            published={progress.published}
            meters={counts ? altitude.meters : 0}
            breakdown={breakdownText(altitude)}
            note={basisNote(altitude)}
          />
          {hasLessons ? <ContinueBlock classId={classId} next={progress.next} /> : null}
        </div>
      ) : null}
      <OutlineList classId={classId} outline={outline} />
      <DeckLibrary decks={decks} classCode={code} outline={outline} liveIds={liveDeckIds(live)} />
      <ClassOps classCode={code} {...ops} />
    </div>
  );
}
