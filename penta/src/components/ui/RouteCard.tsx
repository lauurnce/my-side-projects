import styles from "./RouteCard.module.css";

export type RouteCardProps = {
  href: string;
  code: string;
  section: string;
  title: string;
  lessonsDone: number;
  lessonsTotal: number;
  meters: number;
};

function progressPercent(done: number, total: number) {
  const ratio = done / total;
  if (!Number.isFinite(ratio)) return 0;
  return Math.round(Math.min(Math.max(ratio, 0), 1) * 100);
}

export function RouteCard({ href, code, section, title, lessonsDone, lessonsTotal, meters }: RouteCardProps) {
  const altitude = meters.toLocaleString("en-US");
  return (
    <a className={styles.link} href={href}>
      <span className={styles.card}>
        <span className={styles.row}>
          <span>{code}</span>
          <span>
            <span aria-hidden="true">[ </span>
            {section}
            <span aria-hidden="true"> ]</span>
          </span>
        </span>
        <span className={styles.title}>{title}</span>
        <span className={styles.progress}>
          <span className={styles.track} aria-hidden="true">
            <span
              className={styles.fill}
              data-fill=""
              style={{ width: `${progressPercent(lessonsDone, lessonsTotal)}%` }}
            />
          </span>
          <span className={styles.counts}>
            <span>
              <span aria-hidden="true">
                Lesson {lessonsDone} / {lessonsTotal}
              </span>
              <span className="visually-hidden">
                Lesson {lessonsDone} of {lessonsTotal}
              </span>
            </span>
            <span>
              <span aria-hidden="true">{altitude} m</span>
              <span className="visually-hidden">{altitude} meters</span>
            </span>
          </span>
        </span>
      </span>
    </a>
  );
}
