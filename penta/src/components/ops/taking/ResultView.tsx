import { BracketLabel } from "@/components/ui/BracketLabel";
import { formatManilaDateTime } from "@/lib/manila-time";
import { percent, type Activity, type ReviewItem, type SubmittedReview } from "@/lib/quiz";
import { acceptedText, answerText, questionLegend } from "./helpers";
import styles from "./taking.module.css";

export type ResultViewProps = { activity: Activity; review: SubmittedReview; canRetry: boolean };

function hiddenReason(activity: Activity): string {
  const due = activity.showAnswers === "after_due" ? formatManilaDateTime(activity.dueAt) : null;
  return due ? `Answers are shown after the due time (${due}).` : "Your teacher has chosen not to show the answers.";
}

function ReviewedItem({ item, number, reveal }: { item: ReviewItem; number: number; reveal: boolean }) {
  const given = answerText(item, item.answer);
  const accepted = reveal ? acceptedText(item, item.accepted) : null;

  return (
    <li className={styles.reviewed}>
      <h3 className={styles.legend}>{questionLegend(number, item.points)}</h3>
      <p className={styles.prompt} dir="auto">
        {item.prompt}
      </p>
      <p className={styles.given} dir="auto">
        {given ? `Your answer: ${given}` : "No answer"}
      </p>
      {reveal ? <p className={styles.mark}>{item.isCorrect ? "Correct" : "Incorrect"}</p> : null}
      {accepted ? (
        <p className={styles.accepted} dir="auto">
          Correct answer: {accepted}
        </p>
      ) : null}
    </li>
  );
}

export function ResultView({ activity, review, canRetry }: ResultViewProps) {
  const submitted = formatManilaDateTime(review.submittedAt);

  return (
    <div className={styles.page}>
      <a className={styles.back} href={`/ops/${activity.id}`}>
        Back to quiz overview
      </a>
      <header className={styles.header}>
        <p className={styles.labels}>
          <BracketLabel>Layer 03 · Ops</BracketLabel>
          <BracketLabel>Quiz result</BracketLabel>
        </p>
        <p className={styles.quizName} dir="auto">
          {activity.title}
        </p>
      </header>
      <div className={`${styles.scoreCard} on-card`}>
        <h1 className={styles.score}>
          <span className={styles.scoreLead}>You scored</span>{" "}
          <span className={styles.scoreFigure}>
            {review.score} of {review.maxScore}
          </span>
        </h1>
        <p className={styles.scoreFacts}>
          <span>{percent(review.score, review.maxScore)}%</span>
          <span>Attempt {review.attemptNo}</span>
          {submitted ? <span>Submitted {submitted}</span> : null}
        </p>
      </div>
      {review.reveal ? null : <p className={styles.note}>{hiddenReason(activity)}</p>}
      {canRetry ? (
        <p className={styles.note}>You can try again. Start another attempt from the quiz overview.</p>
      ) : null}
      <section className={styles.attempts}>
        <h2 className={styles.heading}>Your answers</h2>
        <ol className={styles.reviewList}>
          {review.items.map((item, index) => (
            <ReviewedItem key={item.id} item={item} number={index + 1} reveal={review.reveal} />
          ))}
        </ol>
      </section>
    </div>
  );
}
