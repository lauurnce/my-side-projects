import Link from "next/link";
import { rekeyQuestion, runBuilderAction, saveQuestion, saveQuizSettings } from "@/app/ops/builder-actions";
import { settingsValues } from "@/app/ops/builder-schema";
import teacherStyles from "@/components/classes/teacher/teacher.module.css";
import { lessonGroups } from "@/components/decks/teacher/labels";
import { BracketLabel } from "@/components/ui/BracketLabel";
import { StatusChip } from "@/components/ui/StatusChip";
import type { CurrentUser } from "@/lib/auth";
import { loadClassDecks } from "@/lib/decks";
import { isPastDue, loadActivityAttempts, loadTeacherQuestions, type Activity } from "@/lib/quiz";
import { loadClassOutline } from "@/lib/routes";
import { createClient } from "@/lib/supabase/server";
import { pointsSummary, statusWord } from "./builder/labels";
import { QuestionBoard } from "./builder/QuestionBoard";
import { QuizActions } from "./builder/QuizActions";
import { SettingsForm } from "./builder/SettingsForm";
import styles from "./builder/builder.module.css";

export type QuizBuilderProps = { user: CurrentUser; activity: Activity };

function isOpenNow(activity: Activity): boolean {
  return activity.publishedAt !== null && !isPastDue(activity, Date.now());
}

export async function QuizBuilder({ user, activity }: QuizBuilderProps) {
  const supabase = await createClient();
  const [questions, decks, outline, attempts] = await Promise.all([
    loadTeacherQuestions(supabase, activity.id),
    loadClassDecks(supabase, activity.classId),
    loadClassOutline(supabase, activity.classId, user.id),
    loadActivityAttempts(supabase, activity.id),
  ]);
  const published = activity.publishedAt !== null;
  const hasAttempts = attempts.length > 0;
  const readyDecks = decks.filter((deck) => deck.ready).map((deck) => ({ id: deck.id, title: deck.title }));

  return (
    <div className={teacherStyles.page}>
      <Link className={teacherStyles.back} href={`/classes/${activity.classId}`}>
        Back to the class
      </Link>
      <header className={styles.head}>
        <div className={styles.headLabels}>
          <BracketLabel>Layer 03 · Ops</BracketLabel>
          <BracketLabel>Quiz</BracketLabel>
          <StatusChip status={published ? "submitted" : "due"}>{statusWord(published)}</StatusChip>
        </div>
        <h1 className={styles.title} dir="auto">
          {activity.title}
        </h1>
        <p className={styles.summary}>{pointsSummary(activity.points, questions.length)}</p>
        <Link className={teacherStyles.back} href={`/ops/${activity.id}/results`}>
          Results
        </Link>
      </header>
      <SettingsForm
        key={activity.id}
        activityId={activity.id}
        values={settingsValues(activity)}
        decks={readyDecks}
        lessons={lessonGroups(outline)}
        timeLimitLocked={hasAttempts}
        action={saveQuizSettings}
      />
      <QuestionBoard
        key={`${activity.id}-${published}`}
        activityId={activity.id}
        questions={questions}
        published={published}
        saveAction={saveQuestion}
        listAction={runBuilderAction}
        rekeyAction={rekeyQuestion}
      />
      <QuizActions
        activityId={activity.id}
        published={published}
        hasAttempts={hasAttempts}
        canClose={isOpenNow(activity)}
        action={runBuilderAction}
      />
    </div>
  );
}
