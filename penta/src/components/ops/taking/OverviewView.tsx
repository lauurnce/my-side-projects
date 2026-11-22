import { startMessages, type StartAction } from "@/app/ops/attempt-schema";
import { BracketLabel } from "@/components/ui/BracketLabel";
import { Markdown } from "@/components/ui/Markdown";
import { StatusChip } from "@/components/ui/StatusChip";
import { UnlockCard } from "@/components/ui/UnlockCard";
import { formatManilaDateTime } from "@/lib/manila-time";
import { bestAttempt, percent, type Activity, type Attempt } from "@/lib/quiz";
import { primaryAction, timeLimitText, type DeckGate, type PrimaryAction } from "./helpers";
import { StartForm } from "./StartForm";
import styles from "./taking.module.css";

export type OverviewViewProps = {
  activity: Activity;
  attempts: Attempt[];
  gate: DeckGate;
  now: number;
  action: StartAction;
};

const sentences: Partial<Record<PrimaryAction, string>> = {
  closed: startMessages.closed,
  no_attempts: startMessages.limit,
  unavailable: startMessages.not_found,
};

function Facts({ activity, used }: { activity: Activity; used: number }) {
  const due = formatManilaDateTime(activity.dueAt);

  return (
    <ul className={styles.facts}>
      <li>Points: {activity.points}</li>
      <li>{due ? `Due: ${due}` : "No due date"}</li>
      <li>{timeLimitText(activity.timeLimitMin)}</li>
      <li>
        Attempts: {used} of {activity.attemptLimit} used
      </li>
      {due && activity.timeLimitMin !== null ? (
        <li>The quiz closes at the due time even if your timer has not run out.</li>
      ) : null}
    </ul>
  );
}

function Gate({ title, gate }: { title: string; gate: DeckGate }) {
  if (gate.state === "none") return null;
  if (gate.state === "unreadable") {
    return <p className={styles.note}>A deck must be finished first. It is not available yet.</p>;
  }
  return <UnlockCard title={title} viewed={gate.viewed} total={gate.total} href={gate.href} />;
}

function AttemptLine({ activityId, attempt, best }: { activityId: string; attempt: Attempt; best: boolean }) {
  if (attempt.submittedAt === null || attempt.score === null) {
    return <li className={styles.attempt}>Attempt {attempt.attemptNo}: in progress</li>;
  }

  return (
    <li className={styles.attempt}>
      <span className={styles.attemptScore}>
        Attempt {attempt.attemptNo}: {attempt.score} of {attempt.maxScore} ({percent(attempt.score, attempt.maxScore)}%)
      </span>
      {best ? <StatusChip status="graded">Best</StatusChip> : null}
      <span className={styles.attemptTime}>Submitted {formatManilaDateTime(attempt.submittedAt)}</span>
      <a className={styles.textLink} href={`/ops/${activityId}/attempt/${attempt.id}`}>
        See attempt {attempt.attemptNo}
      </a>
    </li>
  );
}

export function OverviewView({ activity, attempts, gate, now, action }: OverviewViewProps) {
  const primary = primaryAction(activity, attempts, gate, now);
  const best = bestAttempt(attempts);
  const sentence = sentences[primary];

  return (
    <div className={styles.page}>
      <a className={styles.back} href={`/classes/${activity.classId}`}>
        Back to class
      </a>
      <header className={styles.header}>
        <p className={styles.labels}>
          <BracketLabel>Layer 03 · Ops</BracketLabel>
          <BracketLabel>Quiz</BracketLabel>
        </p>
        <h1 className={styles.title} dir="auto">
          {activity.title}
        </h1>
      </header>
      <Facts activity={activity} used={attempts.length} />
      {activity.instructionsMd.trim() ? <Markdown>{activity.instructionsMd}</Markdown> : null}
      <Gate title={activity.title} gate={gate} />
      {primary === "start" ? <StartForm action={action} activityId={activity.id} label="Start quiz" /> : null}
      {primary === "continue" ? <StartForm action={action} activityId={activity.id} label="Continue quiz" /> : null}
      {sentence ? <p className={styles.note}>{sentence}</p> : null}
      {attempts.length > 0 ? (
        <section className={styles.attempts}>
          <h2 className={styles.heading}>Your attempts</h2>
          <ol className={styles.attemptList}>
            {attempts.map((attempt) => (
              <AttemptLine key={attempt.id} activityId={activity.id} attempt={attempt} best={best?.id === attempt.id} />
            ))}
          </ol>
        </section>
      ) : null}
    </div>
  );
}
