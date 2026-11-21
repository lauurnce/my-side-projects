"use client";

import { useActionState } from "react";
import type { OutlineState } from "@/app/classes/routes-schema";
import { publishLabel, publishWord, statusWord } from "@/components/classes/teacher/outline/labels";
import { FilterPill } from "@/components/ui/FilterPill";
import { StatusChip } from "@/components/ui/StatusChip";
import styles from "./editor.module.css";

export type PublishAction = (previousState: OutlineState, formData: FormData) => Promise<OutlineState>;

export type PublishControlProps = {
  lessonId: string;
  title: string;
  published: boolean;
  action: PublishAction;
};

const initialState: OutlineState = {};

export function PublishControl({ lessonId, title, published, action }: PublishControlProps) {
  const [state, formAction, pending] = useActionState(action, initialState);

  return (
    <div className={styles.publish}>
      <StatusChip status={published ? "submitted" : "due"}>{statusWord(published)}</StatusChip>
      <form action={formAction}>
        <input type="hidden" name="intent" value="setLessonPublished" />
        <input type="hidden" name="lessonId" value={lessonId} />
        <input type="hidden" name="published" value={String(!published)} />
        <FilterPill
          type="submit"
          className={styles.publishButton}
          aria-label={publishLabel(title, published)}
          disabled={pending}
        >
          {publishWord(published)}
        </FilterPill>
      </form>
      {state.message && (
        <p role={state.tone === "status" ? "status" : "alert"} className={styles.message}>
          {state.message}
        </p>
      )}
    </div>
  );
}
