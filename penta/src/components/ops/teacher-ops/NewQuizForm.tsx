"use client";

import { useActionState } from "react";
import type { QuizActionState } from "@/app/ops/builder-schema";
import outlineStyles from "@/components/classes/teacher/outline/outline.module.css";
import teacherStyles from "@/components/classes/teacher/teacher.module.css";
import { Field } from "@/components/ui/Field";
import { FilterPill } from "@/components/ui/FilterPill";
import { quizLimits } from "@/lib/config";

export type NewQuizAction = (previousState: QuizActionState, formData: FormData) => Promise<QuizActionState>;

const initialState: QuizActionState = {};

export function NewQuizForm({ classId, action }: { classId: string; action: NewQuizAction }) {
  const [state, formAction, pending] = useActionState(action, initialState);

  return (
    <>
      {state.message && (
        <p role={state.tone === "status" ? "status" : "alert"} className={teacherStyles.notice}>
          {state.message}
        </p>
      )}
      <form action={formAction} className={outlineStyles.inlineForm}>
        <input type="hidden" name="intent" value="createQuiz" />
        <input type="hidden" name="classId" value={classId} />
        <div className={outlineStyles.inlineField}>
          <Field
            label="Quiz title"
            name="title"
            type="text"
            required
            maxLength={quizLimits.titleLength}
            autoComplete="off"
            dir="auto"
          />
        </div>
        <FilterPill type="submit" className={outlineStyles.primary} disabled={pending}>
          New quiz
        </FilterPill>
      </form>
    </>
  );
}
