import Link from "next/link";
import { BracketLabel } from "@/components/ui/BracketLabel";
import type { Activity } from "@/lib/quiz";
import {
  countsLine,
  itemAnalysis,
  scoresLine,
  studentRows,
  summary,
  type QuizResultsData,
} from "@/lib/quiz-results";
import { ItemList } from "./ItemList";
import styles from "./results.module.css";
import { StudentTable } from "./StudentTable";

export type ResultsViewProps = { activity: Activity; results: QuizResultsData | null };

function countLabel(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

function ResultsBody({ activity, results }: { activity: Activity; results: QuizResultsData }) {
  const rows = studentRows(results.roster, results.attempts);
  const totals = summary(rows);
  const scores = scoresLine(totals, activity.points);

  if (results.attempts.length === 0) {
    return <p className={styles.empty}>No attempts yet. Scores show up here when a student starts the quiz.</p>;
  }

  return (
    <>
      <p className={styles.summary}>
        <span>{countsLine(totals)}</span>
        {scores ? <span>{scores}</span> : null}
      </p>
      <section className={styles.section} aria-labelledby="results-students-title">
        <h2 id="results-students-title" className={styles.sectionTitle}>
          Students
        </h2>
        <StudentTable rows={rows} />
      </section>
      <section className={styles.section} aria-labelledby="results-items-title">
        <h2 id="results-items-title" className={styles.sectionTitle}>
          Percent correct per question
        </h2>
        <p className={styles.note}>Based on each student&apos;s first submitted attempt.</p>
        <ItemList items={itemAnalysis(results.questions, results.attempts, results.answers)} />
      </section>
    </>
  );
}

export function ResultsView({ activity, results }: ResultsViewProps) {
  return (
    <div className={styles.page}>
      <Link className={styles.back} href={`/ops/${activity.id}`}>
        Back to the quiz
      </Link>
      <header className={styles.head}>
        <p className={styles.labels}>
          <BracketLabel>Results</BracketLabel>
          <BracketLabel>{countLabel(activity.points, "point", "points")}</BracketLabel>
          {results ? <BracketLabel>{countLabel(results.roster.length, "student", "students")}</BracketLabel> : null}
        </p>
        <h1 className={styles.title} dir="auto">
          {activity.title}
        </h1>
      </header>
      {results ? (
        <ResultsBody activity={activity} results={results} />
      ) : (
        <p role="alert" className={styles.notice}>
          Could not load the results. Reload the page to try again.
        </p>
      )}
    </div>
  );
}
