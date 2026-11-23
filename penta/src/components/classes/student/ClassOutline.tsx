import Link from "next/link";
import { BracketLabel } from "@/components/ui/BracketLabel";
import { OctagonCTA } from "@/components/ui/OctagonCTA";
import { StatusChip } from "@/components/ui/StatusChip";
import { formatMeters, progressPercent, type ClassProgress } from "@/lib/classes";
import type { ClassOutline, OutlineModule } from "@/lib/routes";
import styles from "./student.module.css";

export function lessonHref(classId: string, lessonId: string): string {
  return `/classes/${classId}/lessons/${lessonId}`;
}

export function publishedModules(outline: ClassOutline): OutlineModule[] {
  return outline.modules
    .map((moduleItem) => ({ ...moduleItem, lessons: moduleItem.lessons.filter((lesson) => lesson.published) }))
    .filter((moduleItem) => moduleItem.lessons.length > 0);
}

export type ProgressBlockProps = Pick<ClassProgress, "done" | "published"> & {
  meters: number;
  breakdown?: string;
  note?: string | null;
};

export function ProgressBlock({ done, published, meters, breakdown, note }: ProgressBlockProps) {
  const altitude = formatMeters(meters);
  return (
    <section className={styles.progress} aria-label="Progress">
      <p className={styles.progressCount}>
        {done} of {published} {published === 1 ? "lesson" : "lessons"} done
      </p>
      <p className={styles.altitude}>
        <span aria-hidden="true">{altitude} m</span>
        <span className="visually-hidden">{altitude} meters</span>
      </p>
      {breakdown ? <p className={styles.breakdown}>{breakdown}</p> : null}
      {note ? <p className={styles.breakdownNote}>{note}</p> : null}
      <span className={styles.track} aria-hidden="true">
        <span className={styles.fill} data-fill="" style={{ width: `${progressPercent({ done, published })}%` }} />
      </span>
    </section>
  );
}

export function ContinueBlock({ classId, next }: { classId: string; next: ClassProgress["next"] }) {
  if (!next) return <p className={styles.allDone}>All lessons done.</p>;
  return (
    <div className={styles.resume}>
      <OctagonCTA
        href={lessonHref(classId, next.id)}
        eyebrow="Continue where you left off"
        title={next.title}
        size={96}
      />
    </div>
  );
}

export function OutlineList({ classId, outline }: { classId: string; outline: ClassOutline }) {
  const modules = publishedModules(outline);
  if (modules.length === 0) {
    return <p className={styles.empty}>No lessons yet. Your teacher has not published any.</p>;
  }

  return (
    <div className={styles.outline}>
      {modules.map((moduleItem, index) => (
        <section key={moduleItem.id} className={styles.module} aria-labelledby={`module-${moduleItem.id}`}>
          <BracketLabel>Module {String(index + 1).padStart(2, "0")}</BracketLabel>
          <h2 id={`module-${moduleItem.id}`} className={styles.moduleTitle}>
            {moduleItem.title}
          </h2>
          <ol className={styles.lessons}>
            {moduleItem.lessons.map((lesson) => (
              <li key={lesson.id}>
                <Link className={styles.lesson} href={lessonHref(classId, lesson.id)}>
                  <span className={styles.lessonMeta}>
                    <StatusChip status={lesson.done ? "graded" : "due"}>{lesson.done ? "Done" : "To do"}</StatusChip>
                    <span className={styles.minutes}>{lesson.estMinutes} min</span>
                  </span>
                  <span className={styles.lessonTitle}>{lesson.title}</span>
                </Link>
              </li>
            ))}
          </ol>
        </section>
      ))}
    </div>
  );
}
