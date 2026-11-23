"use client";

import { useActionState } from "react";
import {
  uploadMessages,
  type SaveUploadSettingsState,
  type UploadSettingsValues,
} from "@/app/ops/grading-schema";
import teacherStyles from "@/components/classes/teacher/teacher.module.css";
import type { LessonGroup } from "@/components/decks/teacher/labels";
import { NotedField, SelectField, TextAreaField } from "@/components/ops/builder/fields";
import builderStyles from "@/components/ops/builder/builder.module.css";
import { Field } from "@/components/ui/Field";
import { FilterPill } from "@/components/ui/FilterPill";
import { quizLimits, submissionLimits } from "@/lib/config";
import { gradingNotes } from "./helpers";

export type SaveUploadSettingsAction = (
  previousState: SaveUploadSettingsState,
  formData: FormData,
) => Promise<SaveUploadSettingsState>;

export type UploadSettingsFormProps = {
  activityId: string;
  values: UploadSettingsValues;
  lessons: LessonGroup[];
  pointsLocked: boolean;
  action: SaveUploadSettingsAction;
};

const initialState: SaveUploadSettingsState = {};

const pointsRange = {
  type: "number",
  required: true,
  min: 1,
  max: submissionLimits.pointsMax,
  step: 1,
  inputMode: "numeric",
} as const;

export function UploadSettingsForm({ activityId, values, lessons, pointsLocked, action }: UploadSettingsFormProps) {
  const [state, formAction, pending] = useActionState(action, initialState);
  const shown = state.values ?? values;
  const errors = state.fieldErrors ?? {};

  return (
    <section className={teacherStyles.section}>
      <div className={teacherStyles.sectionHead}>
        <h2 className={teacherStyles.sectionTitle}>Settings</h2>
      </div>
      <form action={formAction} className={builderStyles.form}>
        <input type="hidden" name="activityId" value={activityId} />
        <Field
          label="Activity title"
          name="title"
          type="text"
          required
          maxLength={quizLimits.titleLength}
          autoComplete="off"
          dir="auto"
          defaultValue={shown.title}
          error={errors.title}
        />
        <div className={builderStyles.pair}>
          {pointsLocked ? (
            <NotedField
              {...pointsRange}
              label="Points"
              name="points"
              readOnly
              defaultValue={shown.points}
              error={errors.points}
              hint={uploadMessages.pointsLocked}
            />
          ) : (
            <Field {...pointsRange} label="Points" name="points" defaultValue={shown.points} error={errors.points} />
          )}
          <NotedField
            label="Due date"
            name="dueAt"
            type="datetime-local"
            defaultValue={shown.dueAt}
            error={errors.dueAt}
            hint={gradingNotes.dueDate}
          />
        </div>
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
        <TextAreaField
          label="Instructions"
          name="instructions"
          rows={8}
          spellCheck
          defaultValue={shown.instructions}
          error={errors.instructions}
          hint={gradingNotes.instructions}
        />
        <div className={builderStyles.formFoot}>
          <FilterPill type="submit" className={builderStyles.submit} disabled={pending}>
            {pending ? "Saving" : "Save settings"}
          </FilterPill>
          {state.message && (
            <p role={state.tone === "status" ? "status" : "alert"} className={builderStyles.message}>
              {state.message}
            </p>
          )}
        </div>
      </form>
    </section>
  );
}
