"use client";

import { useActionState } from "react";
import { questionValues, type QuizActionState } from "@/app/ops/builder-schema";
import outlineStyles from "@/components/classes/teacher/outline/outline.module.css";
import type { TeacherQuestion } from "@/lib/quiz";
import { AcceptedAnswers, TruthChoice } from "./KeyFields";
import { builderNotes } from "./labels";
import styles from "./builder.module.css";

export type RekeyAction = (previousState: QuizActionState, formData: FormData) => Promise<QuizActionState>;

export type RekeyFormProps = {
  question: TeacherQuestion;
  index: number;
  action: RekeyAction;
};

const initialState: QuizActionState = {};

function CorrectOption({ options, correctOption }: { options: string[]; correctOption: string }) {
  return (
    <fieldset className={styles.choices}>
      <legend className={styles.label}>Correct option</legend>
      {options.map((option, optionIndex) => (
        <label key={optionIndex} className={styles.choice}>
          <input
            type="radio"
            name="correctOption"
            value={optionIndex + 1}
            defaultChecked={correctOption === String(optionIndex + 1)}
          />
          <span className={styles.optionText} dir="auto">
            {option}
          </span>
        </label>
      ))}
    </fieldset>
  );
}

export function RekeyForm({ question, index, action }: RekeyFormProps) {
  const [state, formAction, pending] = useActionState(action, initialState);
  const values = questionValues(question);

  return (
    <form action={formAction} className={styles.rekey}>
      <input type="hidden" name="questionId" value={question.id} />
      <input type="hidden" name="kind" value={question.kind} />
      {question.kind === "mcq" && (
        <CorrectOption options={question.options ?? []} correctOption={values.correctOption} />
      )}
      {question.kind === "tf" && <TruthChoice truth={values.truth} />}
      {question.kind === "ident" && <AcceptedAnswers accepted={values.accepted} />}
      <p className={styles.hint}>{builderNotes.rekey}</p>
      <div className={styles.formFoot}>
        <button
          type="submit"
          className={outlineStyles.button}
          aria-label={`Change the key of item ${index + 1}`}
          disabled={pending}
        >
          Change the key
        </button>
        {state.message && (
          <p role={state.tone === "status" ? "status" : "alert"} className={styles.message}>
            {state.message}
          </p>
        )}
      </div>
    </form>
  );
}
