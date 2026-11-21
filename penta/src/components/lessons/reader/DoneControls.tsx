"use client";

import { useActionState } from "react";
import { idleLessonDoneState, type LessonDoneAction } from "@/app/classes/lesson-messages";
import { FilterPill } from "@/components/ui/FilterPill";
import { StatusChip } from "@/components/ui/StatusChip";
import styles from "./reader.module.css";

export type DoneControlsProps = {
  lessonId: string;
  done: boolean;
  action: LessonDoneAction;
};

export function DoneControls({ lessonId, done, action }: DoneControlsProps) {
  const [state, formAction, pending] = useActionState(action, idleLessonDoneState);
  const idleLabel = done ? "Mark as not done" : "Mark as done";

  return (
    <div className={styles.done}>
      <div className={styles.doneRow}>
        {done ? <StatusChip status="graded">Done</StatusChip> : null}
        <form action={formAction}>
          <input type="hidden" name="lessonId" value={lessonId} />
          <input type="hidden" name="done" value={done ? "false" : "true"} />
          <FilterPill type="submit" disabled={pending} className={done ? styles.undo : styles.mark}>
            {pending ? "Saving" : idleLabel}
          </FilterPill>
        </form>
      </div>
      <p role="status" className={styles.saved}>
        {state.status === "saved" ? state.message : ""}
      </p>
      {state.status === "error" ? (
        <p role="alert" className={styles.alert}>
          {state.message}
        </p>
      ) : null}
    </div>
  );
}
