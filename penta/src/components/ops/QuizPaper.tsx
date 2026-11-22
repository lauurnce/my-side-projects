import { submitQuiz } from "@/app/ops/attempt-actions";
import { BracketLabel } from "@/components/ui/BracketLabel";
import { formatManilaDateTime } from "@/lib/manila-time";
import type { Activity, OpenPaper } from "@/lib/quiz";
import { PaperForm } from "./taking/PaperForm";
import styles from "./taking/taking.module.css";

export type QuizPaperProps = { activity: Activity; attemptId: string; paper: OpenPaper };

export function QuizPaper({ activity, attemptId, paper }: QuizPaperProps) {
  const closesAt = formatManilaDateTime(paper.expiresAt);

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <p className={styles.labels}>
          <BracketLabel>Layer 03 · Ops</BracketLabel>
          <BracketLabel>Quiz</BracketLabel>
          <BracketLabel>Attempt {paper.attemptNo}</BracketLabel>
        </p>
        <h1 className={styles.title} dir="auto">
          {activity.title}
        </h1>
      </header>
      <noscript>
        <p className={styles.note}>
          Your answers are sent only when you press Submit quiz.
          {closesAt ? ` This attempt closes at ${closesAt}.` : ""}
        </p>
      </noscript>
      <PaperForm
        action={submitQuiz}
        activityId={activity.id}
        attemptId={attemptId}
        questions={paper.questions}
        answers={paper.answers}
        expiresAt={paper.expiresAt}
        now={paper.now}
      />
    </div>
  );
}
