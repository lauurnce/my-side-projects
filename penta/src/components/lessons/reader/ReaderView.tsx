import Link from "next/link";
import type { LessonDoneAction } from "@/app/classes/lesson-messages";
import { LessonDeck } from "@/components/decks/library/LessonDeck";
import { BracketLabel } from "@/components/ui/BracketLabel";
import { Markdown } from "@/components/ui/Markdown";
import { StatusChip } from "@/components/ui/StatusChip";
import type { DeckSummary } from "@/lib/decks";
import type { LessonDetail, OutlineLesson, RouteProgress } from "@/lib/routes";
import { DoneControls } from "./DoneControls";
import {
  classHref,
  editLessonHref,
  lessonHref,
  minutesLabel,
  placeLabel,
  progressLabel,
  type LessonPlace,
} from "./helpers";
import styles from "./reader.module.css";

export type ReaderViewProps = {
  lesson: LessonDetail;
  isOwner: boolean;
  done: boolean;
  place: LessonPlace | null;
  previous: OutlineLesson | null;
  next: OutlineLesson | null;
  progress: RouteProgress;
  decks: DeckSummary[];
  action: LessonDoneAction;
};

function OwnerNotice({ lesson }: { lesson: LessonDetail }) {
  return (
    <aside className={styles.notice} aria-label="Teacher preview">
      <StatusChip status={lesson.published ? "submitted" : "due"}>{lesson.published ? "Published" : "Draft"}</StatusChip>
      <p className={styles.noticeText}>
        {lesson.published ? "Preview. Students see this lesson." : "Draft. Students cannot see this lesson yet."}
      </p>
      <Link className={styles.edit} href={editLessonHref(lesson.classId, lesson.id)}>
        Edit lesson
      </Link>
    </aside>
  );
}

function NeighbourLink({
  classId,
  lesson,
  label,
  className,
}: {
  classId: string;
  lesson: OutlineLesson;
  label: "Previous" | "Next";
  className: string;
}) {
  return (
    <Link className={`${styles.neighbour} ${className}`} href={lessonHref(classId, lesson.id)}>
      <span className={styles.neighbourLabel}>{label}</span>
      <span className={styles.neighbourTitle}>{lesson.title}</span>
    </Link>
  );
}

export function ReaderView({
  lesson,
  isOwner,
  done,
  place,
  previous,
  next,
  progress,
  decks,
  action,
}: ReaderViewProps) {
  return (
    <article className={styles.page}>
      <Link className={styles.back} href={classHref(lesson.classId)}>
        Back to the class
      </Link>
      {isOwner ? <OwnerNotice lesson={lesson} /> : null}
      <header className={styles.header}>
        <p className={styles.labels}>
          <BracketLabel>{lesson.moduleTitle}</BracketLabel>
          <BracketLabel>{minutesLabel(lesson.estMinutes)}</BracketLabel>
          {place ? <BracketLabel>{placeLabel(place)}</BracketLabel> : null}
        </p>
        <h1 className={styles.title}>{lesson.title}</h1>
      </header>
      <div className={styles.body}>
        {lesson.bodyMd.trim() ? (
          <Markdown>{lesson.bodyMd}</Markdown>
        ) : (
          <p className={styles.empty}>This lesson has no text yet.</p>
        )}
      </div>
      <LessonDeck decks={decks} lessonTitle={lesson.title} />
      {isOwner ? null : (
        <section className={styles.progress} aria-label="Your progress">
          <DoneControls lessonId={lesson.id} done={done} action={action} />
          <p className={styles.count}>{progressLabel(progress)}</p>
        </section>
      )}
      <nav className={styles.neighbours} aria-label="Lessons">
        {previous ? (
          <NeighbourLink classId={lesson.classId} lesson={previous} label="Previous" className={styles.previous} />
        ) : null}
        {next ? (
          <NeighbourLink classId={lesson.classId} lesson={next} label="Next" className={styles.next} />
        ) : (
          <Link className={`${styles.neighbour} ${styles.next}`} href={classHref(lesson.classId)}>
            <span className={styles.neighbourTitle}>Back to the class</span>
          </Link>
        )}
      </nav>
    </article>
  );
}
