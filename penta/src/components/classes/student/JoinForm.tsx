"use client";

import { useActionState, useId } from "react";
import type { JoinState } from "@/app/classes/student-join";
import { Field } from "@/components/ui/Field";
import { FilterPill } from "@/components/ui/FilterPill";
import styles from "./JoinForm.module.css";

export type JoinAction = (previousState: JoinState, formData: FormData) => Promise<JoinState>;

export function JoinForm({ action, initialState = {} }: { action: JoinAction; initialState?: JoinState }) {
  const [state, formAction, pending] = useActionState(action, initialState);
  const hintId = useId();

  return (
    <form action={formAction} className={styles.form}>
      <div className={styles.fields}>
        <Field
          label="Join code"
          name="code"
          type="text"
          required
          autoCapitalize="characters"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          maxLength={24}
          defaultValue={state.code}
          className={styles.code}
          aria-describedby={hintId}
          error={state.codeError}
        />
        <FilterPill type="submit" disabled={pending} className={styles.submit}>
          Join class
        </FilterPill>
      </div>
      <p id={hintId} className={styles.hint}>
        10 characters, for example K7M2P-9XQ4T. Hyphens and spaces are fine.
      </p>
      {state.formError ? (
        <p role="alert" className={styles.alert}>
          {state.formError}
        </p>
      ) : null}
    </form>
  );
}
