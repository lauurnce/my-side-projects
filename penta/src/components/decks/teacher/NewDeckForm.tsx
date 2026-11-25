"use client";

import { useActionState } from "react";
import type { EditorActionState } from "@/app/decks/editor-schema";
import teacherStyles from "@/components/classes/teacher/teacher.module.css";
import { Field } from "@/components/ui/Field";
import { FilterPill } from "@/components/ui/FilterPill";
import { deckLimits } from "@/lib/config";
import styles from "./decks.module.css";
import type { LessonGroup } from "./labels";
import { LessonSelect } from "./LessonSelect";

export type NewDeckAction = (previous: EditorActionState, formData: FormData) => Promise<EditorActionState>;

export type NewDeckFormProps = {
  classId: string;
  lessons: LessonGroup[];
  action: NewDeckAction;
};

const initialState: EditorActionState = {};

export function NewDeckForm({ classId, lessons, action }: NewDeckFormProps) {
  const [state, formAction, pending] = useActionState(action, initialState);

  return (
    <form className={styles.form} action={formAction} aria-label="Make a deck in PENTA">
      <p className={styles.intro}>Build slides here with titles, text, boxes, arrows and images. Only you see the deck until you publish it.</p>
      <input type="hidden" name="classId" value={classId} />
      <fieldset className={styles.fields} disabled={pending}>
        <div className={styles.wide}>
          <Field label="New deck title" name="title" type="text" required maxLength={deckLimits.titleLength} autoComplete="off" />
        </div>
        <div className={styles.wide}>
          <LessonSelect groups={lessons} spokenLabel="Lesson for the new deck" />
        </div>
        <FilterPill type="submit" className={styles.submit}>
          New deck
        </FilterPill>
      </fieldset>
      {state.message && (
        <p role={state.tone === "status" ? "status" : "alert"} className={teacherStyles.notice}>
          {state.message}
        </p>
      )}
    </form>
  );
}
