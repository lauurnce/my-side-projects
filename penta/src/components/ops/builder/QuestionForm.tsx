"use client";

import { useState, useSyncExternalStore } from "react";
import type { QuestionValues, SaveQuestionState } from "@/app/ops/builder-schema";
import { Field } from "@/components/ui/Field";
import { FilterPill } from "@/components/ui/FilterPill";
import { quizLimits } from "@/lib/config";
import type { QuestionKind } from "@/lib/quiz";
import { SelectField, TextAreaField } from "./fields";
import { AcceptedAnswers, TruthChoice } from "./KeyFields";
import { builderNotes, kindLabels, kinds } from "./labels";
import styles from "./builder.module.css";

export type QuestionFormProps = {
  activityId: string;
  questionId: string | null;
  heading: string;
  values: QuestionValues;
  state: SaveQuestionState;
  resetCount: number;
  focusOnMount: boolean;
  formAction: (formData: FormData) => void;
  pending: boolean;
};

function subscribeToNothing() {
  return () => {};
}

function useHydrated(): boolean {
  return useSyncExternalStore(
    subscribeToNothing,
    () => true,
    () => false,
  );
}

function toKind(value: string): QuestionKind {
  return kinds.find((kind) => kind === value) ?? "mcq";
}

function OptionRows({ values }: { values: QuestionValues }) {
  return (
    <fieldset className={styles.group}>
      <legend className={styles.label}>Options</legend>
      {values.options.map((option, index) => {
        const row = index + 1;
        return (
          <div key={row} className={styles.optionRow}>
            <Field
              label={`Option ${row}`}
              name={`option${row}`}
              type="text"
              maxLength={quizLimits.optionLength}
              autoComplete="off"
              dir="auto"
              defaultValue={option}
            />
            <label className={styles.choice}>
              <input
                type="radio"
                name="correctOption"
                value={row}
                aria-label={`Correct option ${row}`}
                defaultChecked={values.correctOption === String(row)}
              />
              <span>Correct option</span>
            </label>
          </div>
        );
      })}
      <p className={styles.hint}>{builderNotes.options}</p>
    </fieldset>
  );
}

export function QuestionForm({
  activityId,
  questionId,
  heading,
  values,
  state,
  resetCount,
  focusOnMount,
  formAction,
  pending,
}: QuestionFormProps) {
  const [kind, setKind] = useState(toKind(values.kind));
  const hydrated = useHydrated();
  const hiddenUnless = (shown: QuestionKind) => hydrated && kind !== shown;

  return (
    <form action={formAction} className={styles.form}>
      <h3 className={styles.formTitle}>{heading}</h3>
      <input type="hidden" name="activityId" value={activityId} />
      <input type="hidden" name="questionId" value={questionId ?? ""} />
      <div className={styles.pair}>
        <SelectField
          key={resetCount}
          label="Kind"
          name="kind"
          defaultValue={kind}
          onChange={(event) => setKind(toKind(event.target.value))}
        >
          {kinds.map((value) => (
            <option key={value} value={value}>
              {kindLabels[value]}
            </option>
          ))}
        </SelectField>
        <Field
          label="Points"
          name="points"
          type="number"
          required
          min={1}
          max={quizLimits.questionPointsMax}
          step={1}
          inputMode="numeric"
          defaultValue={values.points}
          error={state.fieldErrors?.points}
        />
      </div>
      <TextAreaField
        label="Question"
        name="prompt"
        rows={4}
        required
        autoFocus={focusOnMount}
        defaultValue={values.prompt}
        error={state.fieldErrors?.prompt}
      />
      <div data-kind="mcq" hidden={hiddenUnless("mcq")}>
        <OptionRows values={values} />
      </div>
      <div data-kind="tf" hidden={hiddenUnless("tf")}>
        <TruthChoice truth={values.truth} />
      </div>
      <div data-kind="ident" hidden={hiddenUnless("ident")}>
        <AcceptedAnswers accepted={values.accepted} />
      </div>
      <div className={styles.formFoot}>
        <FilterPill type="submit" className={styles.submit} disabled={pending}>
          Save question
        </FilterPill>
        {state.message && (
          <p role={state.tone === "status" ? "status" : "alert"} className={styles.message}>
            {state.message}
          </p>
        )}
      </div>
    </form>
  );
}
