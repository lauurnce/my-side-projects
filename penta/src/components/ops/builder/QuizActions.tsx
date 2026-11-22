"use client";

import { useActionState } from "react";
import type { BuilderIntent, QuizActionState } from "@/app/ops/builder-schema";
import outlineStyles from "@/components/classes/teacher/outline/outline.module.css";
import teacherStyles from "@/components/classes/teacher/teacher.module.css";
import { FilterPill } from "@/components/ui/FilterPill";
import { builderNotes } from "./labels";
import type { BuilderAction } from "./QuestionBoard";
import styles from "./builder.module.css";

export type QuizActionsProps = {
  activityId: string;
  published: boolean;
  hasAttempts: boolean;
  canClose: boolean;
  action: BuilderAction;
};

const initialState: QuizActionState = {};

function Hidden({ intent, activityId }: { intent: BuilderIntent; activityId: string }) {
  return (
    <>
      <input type="hidden" name="intent" value={intent} />
      <input type="hidden" name="activityId" value={activityId} />
    </>
  );
}

export function QuizActions({ activityId, published, hasAttempts, canClose, action }: QuizActionsProps) {
  const [state, formAction, pending] = useActionState(action, initialState);

  return (
    <section className={teacherStyles.section}>
      <div className={teacherStyles.sectionHead}>
        <h2 className={teacherStyles.sectionTitle}>Publish</h2>
      </div>
      {state.message && (
        <p role={state.tone === "status" ? "status" : "alert"} className={teacherStyles.notice}>
          {state.message}
        </p>
      )}
      {hasAttempts && <p className={styles.hint}>{builderNotes.started}</p>}
      <div className={outlineStyles.actions}>
        {!published && (
          <form action={formAction}>
            <Hidden intent="setQuizPublished" activityId={activityId} />
            <input type="hidden" name="published" value="true" />
            <FilterPill type="submit" className={styles.submit} disabled={pending}>
              Publish quiz
            </FilterPill>
          </form>
        )}
        {published && !hasAttempts && (
          <form action={formAction}>
            <Hidden intent="setQuizPublished" activityId={activityId} />
            <input type="hidden" name="published" value="false" />
            <button type="submit" className={outlineStyles.button} disabled={pending}>
              Unpublish
            </button>
          </form>
        )}
        {canClose && (
          <form action={formAction}>
            <Hidden intent="closeQuizNow" activityId={activityId} />
            <button type="submit" className={outlineStyles.button} disabled={pending}>
              Close quiz now
            </button>
          </form>
        )}
      </div>
      {!hasAttempts && (
        <details className={styles.danger}>
          <summary className={styles.dangerSummary}>Delete this quiz</summary>
          <p className={styles.hint}>{builderNotes.deleteWarning}</p>
          <form action={formAction}>
            <Hidden intent="deleteQuiz" activityId={activityId} />
            <button type="submit" className={outlineStyles.button} disabled={pending}>
              Delete quiz
            </button>
          </form>
        </details>
      )}
    </section>
  );
}
