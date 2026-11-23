"use client";

import { useActionState } from "react";
import type { UploadActionState } from "@/app/ops/grading-schema";
import outlineStyles from "@/components/classes/teacher/outline/outline.module.css";
import teacherStyles from "@/components/classes/teacher/teacher.module.css";
import { Field } from "@/components/ui/Field";
import { FilterPill } from "@/components/ui/FilterPill";
import { quizLimits, submissionLimits } from "@/lib/config";
import styles from "./ops.module.css";

export type NewUploadAction = (previousState: UploadActionState, formData: FormData) => Promise<UploadActionState>;

const initialState: UploadActionState = {};

export function NewUploadForm({ classId, action }: { classId: string; action: NewUploadAction }) {
  const [state, formAction, pending] = useActionState(action, initialState);

  return (
    <>
      {state.message && (
        <p role={state.tone === "status" ? "status" : "alert"} className={teacherStyles.notice}>
          {state.message}
        </p>
      )}
      <form action={formAction} className={outlineStyles.inlineForm}>
        <input type="hidden" name="intent" value="createUploadActivity" />
        <input type="hidden" name="classId" value={classId} />
        <div className={outlineStyles.inlineField}>
          <Field
            label="Activity title"
            name="title"
            type="text"
            required
            maxLength={quizLimits.titleLength}
            autoComplete="off"
            dir="auto"
          />
        </div>
        <div className={styles.points}>
          <Field
            label="Points"
            name="points"
            type="number"
            required
            min={1}
            max={submissionLimits.pointsMax}
            step={1}
            inputMode="numeric"
            defaultValue={100}
          />
        </div>
        <FilterPill type="submit" className={outlineStyles.primary} disabled={pending}>
          New upload activity
        </FilterPill>
      </form>
    </>
  );
}
