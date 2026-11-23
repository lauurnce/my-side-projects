"use client";

import { useActionState, useEffect, useId, useRef } from "react";
import { setThreadLocked } from "@/app/threads/moderation-actions";
import type { ModerationState } from "@/app/threads/moderation-schema";
import type { ThreadInfo } from "@/lib/threads";
import { lockWord, moderationCopy } from "./moderation/labels";
import styles from "./moderation/moderation.module.css";

export type ThreadModerationProps = { thread: ThreadInfo; onChanged: () => void };

const idle: ModerationState = {};

export function ThreadModeration({ thread, onChanged }: ThreadModerationProps) {
  const helpId = useId();
  const [state, formAction, pending] = useActionState(setThreadLocked, idle);
  const handled = useRef(state);

  useEffect(() => {
    if (handled.current === state) return;
    handled.current = state;
    if (state.tone === "status") onChanged();
  }, [state, onChanged]);

  return (
    <div className={styles.thread}>
      <div className={styles.moderation}>
        <form action={formAction} className={styles.controls}>
          <input type="hidden" name="threadId" value={thread.id} />
          <input type="hidden" name="lock" value={thread.locked ? "false" : "true"} />
          <button type="submit" className={styles.button} aria-describedby={helpId} disabled={pending}>
            {lockWord(thread.locked)}
          </button>
        </form>
        <p className={styles.message} role="status">
          {state.tone === "status" ? state.message : ""}
        </p>
        <p className={styles.message} role="alert">
          {state.tone === "alert" ? state.message : ""}
        </p>
      </div>
      <p id={helpId} className={styles.help}>
        {moderationCopy.lockHelp}
      </p>
      <p className={styles.help}>{moderationCopy.hideHelp}</p>
    </div>
  );
}
