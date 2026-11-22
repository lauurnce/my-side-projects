"use client";

import { useActionState } from "react";
import { quizMessages, type SaveSettingsState, type SettingsValues } from "@/app/ops/builder-schema";
import teacherStyles from "@/components/classes/teacher/teacher.module.css";
import type { LessonGroup } from "@/components/decks/teacher/labels";
import { Field } from "@/components/ui/Field";
import { FilterPill } from "@/components/ui/FilterPill";
import { quizLimits } from "@/lib/config";
import { NotedField, SelectField, TextAreaField } from "./fields";
import { builderNotes, showAnswersChoices } from "./labels";
import styles from "./builder.module.css";

export type SaveSettingsAction = (previousState: SaveSettingsState, formData: FormData) => Promise<SaveSettingsState>;

export type DeckChoice = { id: string; title: string };

export type SettingsFormProps = {
  activityId: string;
  values: SettingsValues;
  decks: DeckChoice[];
  lessons: LessonGroup[];
  timeLimitLocked: boolean;
  action: SaveSettingsAction;
};

const initialState: SaveSettingsState = {};

export function SettingsForm({ activityId, values, decks, lessons, timeLimitLocked, action }: SettingsFormProps) {
  const [state, formAction, pending] = useActionState(action, initialState);
  const shown = state.values ?? values;
  const errors = state.fieldErrors ?? {};

  return (
    <section className={teacherStyles.section}>
      <div className={teacherStyles.sectionHead}>
        <h2 className={teacherStyles.sectionTitle}>Settings</h2>
      </div>
      <form action={formAction} className={styles.form}>
        <input type="hidden" name="activityId" value={activityId} />
        <Field
          label="Quiz title"
          name="title"
          type="text"
          required
          maxLength={quizLimits.titleLength}
          autoComplete="off"
          dir="auto"
          defaultValue={shown.title}
          error={errors.title}
        />
        <div className={styles.pair}>
          <NotedField
            label="Due date"
            name="dueAt"
            type="datetime-local"
            defaultValue={shown.dueAt}
            error={errors.dueAt}
            hint={builderNotes.dueDate}
          />
          <NotedField
            label="Time limit in minutes"
            name="timeLimit"
            type="number"
            min={1}
            max={quizLimits.timeLimitMaxMinutes}
            step={1}
            inputMode="numeric"
            readOnly={timeLimitLocked}
            defaultValue={shown.timeLimit}
            error={errors.timeLimit}
            hint={timeLimitLocked ? quizMessages.timeLimitLocked : builderNotes.timeLimit}
          />
        </div>
        <div className={styles.pair}>
          <NotedField
            label="Attempts allowed"
            name="attemptLimit"
            type="number"
            required
            min={1}
            max={quizLimits.attemptLimitMax}
            step={1}
            inputMode="numeric"
            defaultValue={shown.attemptLimit}
            error={errors.attemptLimit}
            hint={builderNotes.attempts}
          />
          <SelectField
            key={`answers-${shown.showAnswers}`}
            label="Show answers"
            name="showAnswers"
            defaultValue={shown.showAnswers}
            error={errors.showAnswers}
            hint={builderNotes.showAnswers}
          >
            {showAnswersChoices.map((choice) => (
              <option key={choice.value} value={choice.value}>
                {choice.label}
              </option>
            ))}
          </SelectField>
        </div>
        <div className={styles.pair}>
          <SelectField
            key={`deck-${shown.deckId}`}
            label="Required deck"
            name="deckId"
            defaultValue={shown.deckId}
            error={errors.deckId}
            hint="Students must finish this deck before they can start."
          >
            <option value="">None</option>
            {decks.map((deck) => (
              <option key={deck.id} value={deck.id}>
                {deck.title}
              </option>
            ))}
          </SelectField>
          <SelectField
            key={`lesson-${shown.lessonId}`}
            label="Linked lesson"
            name="lessonId"
            defaultValue={shown.lessonId}
            error={errors.lessonId}
          >
            <option value="">None</option>
            {lessons.map((group) => (
              <optgroup key={group.moduleId} label={group.moduleTitle}>
                {group.lessons.map((lesson) => (
                  <option key={lesson.id} value={lesson.id}>
                    {lesson.label}
                  </option>
                ))}
              </optgroup>
            ))}
          </SelectField>
        </div>
        <TextAreaField
          label="Instructions"
          name="instructions"
          rows={8}
          spellCheck
          defaultValue={shown.instructions}
          error={errors.instructions}
          hint={builderNotes.instructions}
        />
        <div className={styles.formFoot}>
          <FilterPill type="submit" className={styles.submit} disabled={pending}>
            {pending ? "Saving" : "Save settings"}
          </FilterPill>
          {state.message && (
            <p role={state.tone === "status" ? "status" : "alert"} className={styles.message}>
              {state.message}
            </p>
          )}
        </div>
      </form>
    </section>
  );
}
