import type { StudentRow } from "@/lib/quiz-results";
import { percent } from "@/lib/quiz";
import { formatManilaDateTime } from "@/lib/manila-time";
import styles from "./results.module.css";

export type StudentTableProps = { rows: StudentRow[] };

const statusText: Record<StudentRow["status"], string> = {
  submitted: "Submitted",
  in_progress: "In progress",
  not_started: "Not started",
};

function None() {
  return <span className={styles.none}>None</span>;
}

function scoreText(row: StudentRow): string {
  if (row.bestScore === null || row.maxScore === null) return statusText[row.status];
  return `${row.bestScore} of ${row.maxScore}`;
}

function attemptsText(row: StudentRow): string {
  return row.inProgress && row.status === "submitted" ? `${row.attempts}, one in progress` : String(row.attempts);
}

export function StudentTable({ rows }: StudentTableProps) {
  return (
    <div className={styles.scroll} role="region" aria-labelledby="results-students-caption" tabIndex={0}>
      <table className={styles.table}>
        <caption id="results-students-caption" className={styles.caption}>
          Best score per student
        </caption>
        <thead>
          <tr>
            <th scope="col">Student</th>
            <th scope="col">Best score</th>
            <th scope="col">Percent</th>
            <th scope="col">Attempts</th>
            <th scope="col">Submitted</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.studentId} data-status={row.status}>
              <th scope="row" dir="auto" className={styles.name}>
                {row.name}
              </th>
              <td>{scoreText(row)}</td>
              <td>
                {row.bestScore === null || row.maxScore === null ? (
                  <None />
                ) : (
                  `${percent(row.bestScore, row.maxScore)}%`
                )}
              </td>
              <td>{attemptsText(row)}</td>
              <td>{formatManilaDateTime(row.submittedAt) ?? <None />}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
