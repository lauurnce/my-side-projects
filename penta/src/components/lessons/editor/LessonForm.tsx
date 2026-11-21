"use client";

import { useActionState, useDeferredValue, useId, useState } from "react";
import type { SaveLessonState } from "@/app/classes/routes-schema";
import { Field } from "@/components/ui/Field";
import { FilterPill } from "@/components/ui/FilterPill";
import { Markdown } from "@/components/ui/Markdown";
import { routeLimits } from "@/lib/config";
import type { LessonDetail } from "@/lib/routes";
import styles from "./editor.module.css";
import { PreviewBoundary } from "./PreviewBoundary";

export type SaveLessonAction = (previousState: SaveLessonState, formData: FormData) => Promise<SaveLessonState>;

export type LessonFormProps = {
  lesson: LessonDetail;
  saveAction: SaveLessonAction;
};

const initialState: SaveLessonState = {};

export function characterCountLabel(length: number): string {
  const count = `${length.toLocaleString("en-US")} of ${routeLimits.lessonBodyLength.toLocaleString("en-US")} characters`;
  return length > routeLimits.lessonBodyLength ? `${count}. Too long to save.` : count;
}

export function LessonForm({ lesson, saveAction }: LessonFormProps) {
  const [state, formAction, pending] = useActionState(saveAction, initialState);
  const [loadedRevision] = useState(lesson.revision);
  const [body, setBody] = useState(state.values?.body ?? lesson.bodyMd);
  const previewText = useDeferredValue(body);
  const id = useId();
  const bodyError = state.fieldErrors?.body;
  const savedTextChanged = state.tone === "status" && body !== state.values?.body;
  const bodyDescription = [`${id}-hint`, `${id}-count`, bodyError ? `${id}-error` : ""].filter(Boolean).join(" ");

  return (
    <div className={styles.layout}>
      <form action={formAction} className={styles.form}>
        <input type="hidden" name="lessonId" value={lesson.id} />
        <input type="hidden" name="revision" value={state.revision ?? loadedRevision} />
        <div className={styles.row}>
          <Field
            label="Title"
            name="title"
            type="text"
            required
            maxLength={routeLimits.lessonTitleLength}
            autoComplete="off"
            defaultValue={state.values?.title ?? lesson.title}
            error={state.fieldErrors?.title}
          />
          <Field
            label="Minutes to read"
            name="minutes"
            type="number"
            required
            min={1}
            max={routeLimits.lessonMinutesMax}
            step={1}
            inputMode="numeric"
            defaultValue={state.values?.minutes ?? lesson.estMinutes}
            error={state.fieldErrors?.minutes}
          />
        </div>
        <div className={styles.bodyField}>
          <label htmlFor={`${id}-body`} className={styles.label}>
            Body
          </label>
          <textarea
            id={`${id}-body`}
            name="body"
            className={styles.body}
            rows={22}
            spellCheck
            value={body}
            onChange={(event) => setBody(event.target.value)}
            aria-describedby={bodyDescription}
            aria-invalid={bodyError ? "true" : undefined}
          />
          <div className={styles.bodyNotes}>
            <span id={`${id}-hint`} className={styles.hint}>
              Markdown. Headings, lists, links, quotes and code. Images and raw HTML are not shown.
            </span>
            <span id={`${id}-count`} className={styles.count}>
              {characterCountLabel(body.length)}
            </span>
          </div>
          {bodyError && (
            <span id={`${id}-error`} className={styles.error}>
              {`Error: ${bodyError}`}
            </span>
          )}
        </div>
        <div className={styles.formFoot}>
          <FilterPill type="submit" className={styles.save} disabled={pending}>
            {pending ? "Saving" : "Save"}
          </FilterPill>
          {state.message && !savedTextChanged && (
            <p role={state.tone === "status" ? "status" : "alert"} className={styles.message}>
              {state.message}
            </p>
          )}
        </div>
      </form>
      <section className={styles.preview} aria-labelledby={`${id}-preview`}>
        <h2 id={`${id}-preview`} className={styles.previewTitle}>
          Preview
        </h2>
        <PreviewBoundary text={previewText}>
          {previewText.trim() ? (
            <Markdown>{previewText}</Markdown>
          ) : (
            <p className={styles.hint}>Nothing to preview yet. Write in the body field.</p>
          )}
        </PreviewBoundary>
      </section>
    </div>
  );
}
