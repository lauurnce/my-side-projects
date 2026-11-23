"use client";

import { useActionState, useEffect, useId, useRef, useState } from "react";
import type { ThreadFormAction, ThreadFormState } from "@/app/threads/schema";
import { FilterPill } from "@/components/ui/FilterPill";
import { BodyField } from "./BodyField";
import { editRule } from "./helpers";
import styles from "./screen.module.css";

export type PostFormProps = {
  action: ThreadFormAction;
  label: string;
  submitLabel: string;
  target: Record<string, string>;
  initialBody?: string;
  showEditRule?: boolean;
  autoFocus?: boolean;
  onDone: () => void;
  onCancel?: () => void;
};

const idleState: ThreadFormState = {};

export function PostForm(props: PostFormProps) {
  const { action, label, submitLabel, target, initialBody = "", showEditRule, autoFocus, onDone, onCancel } = props;
  const [state, formAction, pending] = useActionState(action, idleState);
  const [body, setBody] = useState(state.values?.body ?? initialBody);
  const [handled, setHandled] = useState(state);
  const notified = useRef(state);
  const messageId = useId();
  const succeeded = state.tone === "status";

  if (state !== handled) {
    setHandled(state);
    if (succeeded) setBody(initialBody);
  }

  useEffect(() => {
    if (notified.current === state) return;
    notified.current = state;
    if (state.tone === "status") onDone();
  }, [state, onDone]);

  return (
    <form action={formAction} className={styles.form}>
      {Object.entries(target).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      <BodyField
        label={label}
        value={body}
        onChange={setBody}
        autoFocus={autoFocus}
        invalid={state.field === "body"}
        describedBy={state.tone === "alert" ? messageId : undefined}
      />
      {showEditRule ? <p className={styles.help}>{editRule}</p> : null}
      <div className={styles.formFoot}>
        <FilterPill type="submit" className={styles.submit} disabled={pending}>
          {submitLabel}
        </FilterPill>
        {onCancel ? (
          <FilterPill className={styles.ghost} onClick={onCancel}>
            Cancel
          </FilterPill>
        ) : null}
        <p role="status" className={styles.saved}>
          {succeeded ? state.message : ""}
        </p>
      </div>
      {state.tone === "alert" ? (
        <p id={messageId} role="alert" className={styles.alert}>
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
