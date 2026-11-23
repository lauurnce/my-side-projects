"use client";

import { useActionState, useId, useState } from "react";
import { uploadMessages, type GradeState } from "@/app/ops/grading-schema";
import { FilterPill } from "@/components/ui/FilterPill";
import { submissionLimits } from "@/lib/config";
import styles from "./grading.module.css";

export type GradeAction = (previousState: GradeState, formData: FormData) => Promise<GradeState>;

export type GradeFormProps = {
  submissionId: string;
  uploadId: string;
  studentName: string;
  points: number;
  score: number | null;
  feedback: string | null;
  action: GradeAction;
};

const initialState: GradeState = {};

function describedBy(...ids: (string | false)[]): string | undefined {
  return ids.filter(Boolean).join(" ") || undefined;
}

export function GradeForm({ submissionId, uploadId, studentName, points, score, feedback, action }: GradeFormProps) {
  const [state, formAction, pending] = useActionState(action, initialState);
  const [openedUpload] = useState(uploadId);
  const id = useId();
  const messageId = `${id}-message`;
  const shown = state.values ?? { score: score === null ? "" : String(score), feedback: feedback ?? "" };
  const scoreWrong = state.field === "score";
  const feedbackWrong = state.field === "feedback";

  return (
    <form action={formAction} className={styles.gradeForm}>
      <input type="hidden" name="submissionId" value={submissionId} />
      <input type="hidden" name="expectedUpload" value={openedUpload} />
      {openedUpload !== uploadId && !state.message && (
        <p role="status" className={styles.message}>
          {uploadMessages.fileChanged}
        </p>
      )}
      <div className={styles.field}>
        <label htmlFor={`${id}-score`} className={styles.label}>
          Score<span className="visually-hidden">{` for ${studentName}`}</span>
        </label>
        <div className={styles.scoreRow}>
          <input
            id={`${id}-score`}
            className={styles.score}
            name="score"
            type="number"
            required
            min={0}
            max={points}
            step={1}
            inputMode="numeric"
            defaultValue={shown.score}
            aria-describedby={describedBy(`${id}-of`, scoreWrong && messageId)}
            aria-invalid={scoreWrong ? "true" : undefined}
          />
          <span id={`${id}-of`} className={styles.outOf}>{`of ${points}`}</span>
        </div>
      </div>
      <div className={styles.field}>
        <label htmlFor={`${id}-feedback`} className={styles.label}>
          Feedback<span className="visually-hidden">{` for ${studentName}`}</span>
        </label>
        <textarea
          id={`${id}-feedback`}
          className={styles.feedback}
          name="feedback"
          rows={3}
          maxLength={submissionLimits.feedbackLength}
          dir="auto"
          spellCheck
          defaultValue={shown.feedback}
          aria-describedby={describedBy(feedbackWrong && messageId)}
          aria-invalid={feedbackWrong ? "true" : undefined}
        />
      </div>
      <div className={styles.formFoot}>
        <FilterPill type="submit" className={styles.submit} disabled={pending}>
          {pending ? "Saving" : "Save grade"}
        </FilterPill>
        {state.message && (
          <p id={messageId} role={state.tone === "status" ? "status" : "alert"} className={styles.message}>
            {state.message}
          </p>
        )}
      </div>
    </form>
  );
}
