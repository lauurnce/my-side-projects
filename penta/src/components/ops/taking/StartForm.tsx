"use client";

import { useActionState } from "react";
import type { StartAction, StartState } from "@/app/ops/attempt-schema";
import { FilterPill } from "@/components/ui/FilterPill";
import styles from "./taking.module.css";

export type StartFormProps = { action: StartAction; activityId: string; label: "Start quiz" | "Continue quiz" };

const idleState: StartState = {};

export function StartForm({ action, activityId, label }: StartFormProps) {
  const [state, formAction, pending] = useActionState(action, idleState);

  return (
    <form action={formAction} className={styles.start}>
      <input type="hidden" name="activityId" value={activityId} />
      <FilterPill type="submit" disabled={pending} className={styles.submit}>
        {label}
      </FilterPill>
      {state.message ? (
        <p role="alert" className={styles.alert}>
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
