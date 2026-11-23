import { BracketLabel } from "@/components/ui/BracketLabel";
import { Markdown } from "@/components/ui/Markdown";
import { StatusChip } from "@/components/ui/StatusChip";
import { formatManilaDateTime, lateLabel } from "@/lib/manila-time";
import type { Activity } from "@/lib/quiz";
import { submissionState, type Submission, type SubmissionState } from "@/lib/submissions";
import { HandInForm } from "./HandInForm";
import { fileFacts, handInText, scoreText } from "./helpers";
import styles from "./handin.module.css";

export type HandInViewProps = { activity: Activity; submission: Submission | null; now: number };

const stateWords: Record<SubmissionState, string> = {
  not_handed_in: "Not handed in yet",
  missing: "Nothing handed in. You can still hand in a file.",
  handed_in: "Handed in",
  graded: "Graded",
};

function Facts({ activity }: { activity: Activity }) {
  const due = formatManilaDateTime(activity.dueAt);

  return (
    <ul className={styles.facts}>
      <li>Points: {activity.points}</li>
      <li>{due ? `Due: ${due}` : "No due date"}</li>
      <li>{handInText.limits}</li>
    </ul>
  );
}

function LateChip({ activity, submission }: { activity: Activity; submission: Submission }) {
  if (!submission.isLate) return null;
  return <StatusChip status="late">{lateLabel(submission.submittedAt, activity.dueAt) ?? "Late"}</StatusChip>;
}

function StateLine({ activity, submission, state }: { activity: Activity; submission: Submission | null; state: SubmissionState }) {
  return (
    <p className={styles.state}>
      {state === "not_handed_in" ? <StatusChip status="due">Due</StatusChip> : null}
      {state === "missing" ? <strong className={styles.missing}>Missing</strong> : null}
      {state === "handed_in" && !submission?.isLate ? <StatusChip status="submitted">Submitted</StatusChip> : null}
      {state === "graded" ? <StatusChip status="graded">Graded</StatusChip> : null}
      {submission ? <LateChip activity={activity} submission={submission} /> : null}
      <span className={styles.stateWord}>
        {state === "graded" && submission?.score !== null && submission
          ? scoreText(submission.score, activity.points)
          : stateWords[state]}
      </span>
    </p>
  );
}

function CurrentFile({ activityId, submission }: { activityId: string; submission: Submission }) {
  return (
    <div className={styles.file}>
      <p className={styles.fileName}>
        <bdi>{submission.fileName}</bdi>
      </p>
      <p className={styles.fileFacts}>{fileFacts(submission)}</p>
      <p className={styles.fileTime}>Handed in {formatManilaDateTime(submission.submittedAt)}</p>
      {submission.hasFile ? (
        <a className={styles.textLink} href={`/ops/${activityId}/submission/${submission.id}/file`}>
          Open file
        </a>
      ) : null}
      {!submission.hasFile && submission.filesRemovedAt ? (
        <p className={styles.note}>{handInText.filesRemoved}</p>
      ) : null}
    </div>
  );
}

function Grade({ activity, submission }: { activity: Activity; submission: Submission }) {
  return (
    <section className={styles.grade} aria-label="Your grade">
      {submission.score !== null ? (
        <p className={styles.score}>
          <span className={styles.scoreLead}>Score</span>
          <span className={styles.scoreFigure}>{scoreText(submission.score, activity.points)}</span>
        </p>
      ) : null}
      {submission.feedback?.trim() ? (
        <div className={styles.feedback}>
          <h3 className={styles.feedbackLead}>Feedback</h3>
          <p className={styles.feedbackText} dir="auto">
            {submission.feedback}
          </p>
        </div>
      ) : null}
      <p className={styles.gradedTime}>Graded {formatManilaDateTime(submission.gradedAt)}</p>
    </section>
  );
}

export function HandInView({ activity, submission, now }: HandInViewProps) {
  const state = submissionState(activity, submission, now);

  return (
    <div className={styles.page}>
      <a className={styles.back} href={`/classes/${activity.classId}`}>
        Back to class
      </a>
      <header className={styles.header}>
        <p className={styles.labels}>
          <BracketLabel>Layer 03 · Ops</BracketLabel>
          <BracketLabel>Upload</BracketLabel>
        </p>
        <h1 className={styles.title} dir="auto">
          {activity.title}
        </h1>
      </header>
      <Facts activity={activity} />
      {activity.instructionsMd.trim() ? <Markdown>{activity.instructionsMd}</Markdown> : null}
      <section className={styles.work}>
        <h2 className={styles.heading}>Your work</h2>
        <StateLine activity={activity} submission={submission} state={state} />
        {submission ? <CurrentFile activityId={activity.id} submission={submission} /> : null}
        {submission && state === "graded" ? <Grade activity={activity} submission={submission} /> : null}
      </section>
      {state === "graded" ? (
        <p className={styles.note}>{handInText.gradedLocked}</p>
      ) : (
        <HandInForm
          activityId={activity.id}
          dueAt={activity.dueAt}
          current={submission ? { isLate: submission.isLate } : null}
          now={now}
        />
      )}
    </div>
  );
}
