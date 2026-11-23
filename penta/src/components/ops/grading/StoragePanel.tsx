"use client";

import { useActionState } from "react";
import type { UploadActionState } from "@/app/ops/grading-schema";
import outlineStyles from "@/components/classes/teacher/outline/outline.module.css";
import teacherStyles from "@/components/classes/teacher/teacher.module.css";
import { gradingNotes, isStorageAlmostFull, storageLine, type SubmissionStorage } from "./helpers";
import type { UploadAction } from "./UploadActions";
import styles from "./grading.module.css";

export type StoragePanelProps = {
  activityId: string;
  storage: SubmissionStorage | null;
  action: UploadAction;
};

const initialState: UploadActionState = {};

export function StoragePanel({ activityId, storage, action }: StoragePanelProps) {
  const [state, formAction, pending] = useActionState(action, initialState);

  return (
    <section className={teacherStyles.section} aria-labelledby="storage-title">
      <div className={teacherStyles.sectionHead}>
        <h2 id="storage-title" className={teacherStyles.sectionTitle}>
          Storage
        </h2>
      </div>
      <p className={styles.summary}>{storage ? storageLine(storage) : gradingNotes.storageUnknown}</p>
      {storage && isStorageAlmostFull(storage) && (
        <p role="status" className={teacherStyles.notice}>
          {gradingNotes.storageAlmostFull}
        </p>
      )}
      {state.message && (
        <p role={state.tone === "status" ? "status" : "alert"} className={teacherStyles.notice}>
          {state.message}
        </p>
      )}
      <form action={formAction} className={styles.removeForm}>
        <input type="hidden" name="intent" value="removeGradedFiles" />
        <input type="hidden" name="activityId" value={activityId} />
        <button type="submit" className={outlineStyles.button} disabled={pending}>
          Remove files of graded work
        </button>
        <p className={styles.note}>{gradingNotes.removeFiles}</p>
      </form>
    </section>
  );
}
