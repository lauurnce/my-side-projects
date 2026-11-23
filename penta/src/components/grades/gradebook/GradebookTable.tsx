import Link from "next/link";
import {
  altitudeNote,
  cellText,
  countingNote,
  lateWord,
  totalsText,
  type GradebookCell,
  type GradebookModel,
} from "@/lib/gradebook";
import styles from "./gradebook.module.css";

export type GradebookTableProps = { model: GradebookModel };

function pointsText(points: number): string {
  return `${points} ${points === 1 ? "pt" : "pts"}`;
}

function Cell({ cell }: { cell: GradebookCell }) {
  return (
    <td data-state={cell.state} className={styles.cell}>
      <span className={cell.state === "graded" ? styles.score : styles.word}>{cellText(cell)}</span>
      {cell.late && <span className={styles.late}>{lateWord}</span>}
    </td>
  );
}

export function GradebookTable({ model }: GradebookTableProps) {
  if (model.rows.length === 0) {
    return <p className={styles.empty}>No students have joined this class yet.</p>;
  }
  if (model.columns.length === 0) {
    return <p className={styles.empty}>No published activities yet. Publish an activity to start the gradebook.</p>;
  }

  return (
    <div className={styles.block}>
      <div className={styles.scroll} role="region" aria-labelledby="gradebook-caption" tabIndex={0}>
        <table className={styles.table}>
          <caption id="gradebook-caption" className={styles.caption}>
            Scores by student and activity
          </caption>
          <thead>
            <tr>
              <th scope="col" className={styles.student}>
                Student
              </th>
              {model.columns.map((column) => (
                <th key={column.id} scope="col" className={styles.activity}>
                  <Link href={`/ops/${column.id}`} className={styles.activityTitle} dir="auto">
                    {column.title}
                  </Link>
                  <span className={styles.activityMeta}>
                    {column.kind} · {pointsText(column.points)}
                  </span>
                </th>
              ))}
              <th scope="col" className={styles.total}>
                Total
              </th>
              <th scope="col">Percent</th>
              <th scope="col">Not graded</th>
            </tr>
          </thead>
          <tbody>
            {model.rows.map((row) => {
              const totals = totalsText(row.totals);
              return (
                <tr key={row.studentId} data-removed={row.removed ? "true" : undefined}>
                  <th scope="row" dir="auto" className={styles.student}>
                    {row.name}
                  </th>
                  {row.cells.map((cell, index) => (
                    <Cell key={model.columns[index].id} cell={cell} />
                  ))}
                  <td className={styles.total}>{totals.total}</td>
                  <td>{totals.percent ?? ""}</td>
                  <td>{row.totals.notGraded}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className={styles.notes}>
        <p>{countingNote}</p>
        <p>{altitudeNote}</p>
      </div>
    </div>
  );
}
