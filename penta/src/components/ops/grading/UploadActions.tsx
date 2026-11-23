"use client";

import { useActionState } from "react";
import type { UploadActionState, UploadIntent } from "@/app/ops/grading-schema";
import outlineStyles from "@/components/classes/teacher/outline/outline.module.css";
import teacherStyles from "@/components/classes/teacher/teacher.module.css";
import builderStyles from "@/components/ops/builder/builder.module.css";
import { FilterPill } from "@/components/ui/FilterPill";
import { gradingNotes } from "./helpers";

export type UploadAction = (previousState: UploadActionState, formData: FormData) => Promise<UploadActionState>;

export type UploadActionsProps = {
  activityId: string;
  published: boolean;
  hasWork: boolean;
  action: UploadAction;
};

const initialState: UploadActionState = {};

function Hidden({ intent, activityId }: { intent: UploadIntent; activityId: string }) {
  return (
    <>
      <input type="hidden" name="intent" value={intent} />
      <input type="hidden" name="activityId" value={activityId} />
    </>
  );
}

export function UploadActions({ activityId, published, hasWork, action }: UploadActionsProps) {
  const [state, formAction, pending] = useActionState(action, initialState);

  return (
    <section className={teacherStyles.section}>
      <div className={teacherStyles.sectionHead}>
        <h2 className={teacherStyles.sectionTitle}>Publish</h2>
      </div>
      {state.message && (
        <p role={state.tone === "status" ? "status" : "alert"} className={teacherStyles.notice}>
          {state.message}
        </p>
      )}
      {hasWork && <p className={builderStyles.hint}>{gradingNotes.hasWork}</p>}
      {!published && (
        <form action={formAction}>
          <Hidden intent="setUploadPublished" activityId={activityId} />
          <input type="hidden" name="published" value="true" />
          <FilterPill type="submit" className={builderStyles.submit} disabled={pending}>
            Publish activity
          </FilterPill>
        </form>
      )}
      {published && !hasWork && (
        <form action={formAction}>
          <Hidden intent="setUploadPublished" activityId={activityId} />
          <input type="hidden" name="published" value="false" />
          <button type="submit" className={outlineStyles.button} disabled={pending}>
            Unpublish
          </button>
        </form>
      )}
      {!hasWork && (
        <details className={builderStyles.danger}>
          <summary className={builderStyles.dangerSummary}>Delete this activity</summary>
          <p className={builderStyles.hint}>{gradingNotes.deleteWarning}</p>
          <form action={formAction}>
            <Hidden intent="deleteUploadActivity" activityId={activityId} />
            <button type="submit" className={outlineStyles.button} disabled={pending}>
              Delete activity
            </button>
          </form>
        </details>
      )}
    </section>
  );
}
