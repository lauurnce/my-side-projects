import Link from "next/link";
import { BracketLabel } from "@/components/ui/BracketLabel";
import { lateWord, scoreOfPoints, statusText, totalsLine, type GradebookModel } from "@/lib/gradebook";
import { formatManilaShort } from "@/lib/manila-time";
import styles from "./mine.module.css";

export type ClassGradesProps = {
  classId: string;
  code: string;
  title: string;
  model: GradebookModel;
};

export function ClassGrades({ classId, code, title, model }: ClassGradesProps) {
  const headingId = `grades-class-${classId}`;
  const captionId = `grades-caption-${classId}`;
  const row = model.rows[0];

  return (
    <section className={styles.section} aria-labelledby={headingId}>
      <h2 id={headingId} className={styles.heading}>
        <span className={styles.classTitle} dir="auto">
          {title}
        </span>
        <BracketLabel>{code}</BracketLabel>
      </h2>
      {!model.complete || !row ? (
        <p role="alert" className={styles.notice}>
          Could not load these grades. Reload the page.
        </p>
      ) : model.columns.length === 0 ? (
        <p className={styles.empty}>No graded work in this class yet.</p>
      ) : (
        <>
          <div className={styles.scroll} role="region" aria-labelledby={captionId} tabIndex={0}>
            <table className={styles.table}>
              <caption id={captionId} className={styles.caption}>
                Your scores in this class
              </caption>
              <thead>
                <tr>
                  <th scope="col">Activity</th>
                  <th scope="col">Kind</th>
                  <th scope="col">Due</th>
                  <th scope="col">Score</th>
                  <th scope="col">Status</th>
                </tr>
              </thead>
              <tbody>
                {model.columns.map((column, index) => {
                  const cell = row.cells[index];
                  return (
                    <tr key={column.id} data-state={cell.state}>
                      <th scope="row" className={styles.activity}>
                        <Link href={`/ops/${column.id}`} dir="auto">
                          {column.title}
                        </Link>
                      </th>
                      <td>{column.kind}</td>
                      <td>{formatManilaShort(column.dueAt) ?? "No due date"}</td>
                      <td className={styles.score}>{scoreOfPoints(cell)}</td>
                      <td>
                        <span className={styles.word}>{statusText(cell)}</span>
                        {cell.late && <span className={styles.late}>{lateWord}</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className={styles.totals}>
            <span className={styles.totalsLabel}>Class total</span>
            <span>{totalsLine(row.totals)}</span>
          </p>
        </>
      )}
    </section>
  );
}
