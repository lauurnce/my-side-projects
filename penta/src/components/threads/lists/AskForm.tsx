"use client";

import { useActionState, useId, useState } from "react";
import { askQuestion } from "@/app/threads/actions";
import type { ThreadFormState } from "@/app/threads/schema";
import { BodyField } from "@/components/threads/screen/BodyField";
import { Field } from "@/components/ui/Field";
import { FilterPill } from "@/components/ui/FilterPill";
import type { ThreadTarget } from "@/lib/threads";
import styles from "./lists.module.css";

export type AskFormProps = { classId: string; target: ThreadTarget };

const idleState: ThreadFormState = {};

export function AskForm({ classId, target }: AskFormProps) {
  const [state, formAction, pending] = useActionState(askQuestion, idleState);
  const [open, setOpen] = useState(false);
  const [body, setBody] = useState(state.values?.body ?? "");
  const id = useId();
  const failed = state.tone === "alert";
  const shown = open || failed;
  const describedBy = failed ? `${id}-message` : undefined;

  return (
    <div className={styles.ask}>
      <FilterPill
        className={styles.askToggle}
        aria-expanded={shown}
        aria-controls={`${id}-form`}
        onClick={() => setOpen(!shown)}
      >
        Ask a question
      </FilterPill>
      <form id={`${id}-form`} action={formAction} className={styles.askForm} hidden={!shown}>
        <input type="hidden" name="classId" value={classId} />
        {"lessonId" in target ? (
          <input type="hidden" name="lessonId" value={target.lessonId} />
        ) : (
          <input type="hidden" name="activityId" value={target.activityId} />
        )}
        <Field
          label="Question title"
          name="title"
          type="text"
          required
          autoComplete="off"
          dir="auto"
          defaultValue={state.values?.title ?? ""}
          aria-invalid={state.field === "title" ? "true" : undefined}
          aria-describedby={describedBy}
        />
        <BodyField
          label="Your question"
          value={body}
          onChange={setBody}
          invalid={state.field === "body"}
          describedBy={describedBy}
        />
        <div className={styles.askFoot}>
          <FilterPill type="submit" className={styles.submit} disabled={pending}>
            Post question
          </FilterPill>
        </div>
        {failed ? (
          <p id={`${id}-message`} role="alert" className={styles.alert}>
            {state.message}
          </p>
        ) : null}
      </form>
    </div>
  );
}
