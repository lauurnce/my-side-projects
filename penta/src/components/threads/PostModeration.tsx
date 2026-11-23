"use client";

import { useActionState, useEffect, useId, useRef, useState, type MouseEvent } from "react";
import { useParams } from "next/navigation";
import { setPostHidden } from "@/app/threads/moderation-actions";
import type { ModerationState } from "@/app/threads/moderation-schema";
import type { ThreadPost } from "@/lib/threads";
import { editCountLabel, hideLabel, hideWord, moderationCopy } from "./moderation/labels";
import { PostHistory } from "./moderation/PostHistory";
import styles from "./moderation/moderation.module.css";

export type PostModerationProps = { post: ThreadPost; onChanged: () => void };

const idle: ModerationState = {};

export function PostModeration({ post, onChanged }: PostModerationProps) {
  const params = useParams();
  const threadId = typeof params?.id === "string" ? params.id : "";
  const warningId = useId();
  const [state, formAction, pending] = useActionState(setPostHidden, idle);
  const [confirmedFor, setConfirmedFor] = useState<ModerationState | null>(null);
  const handled = useRef(state);
  const returnFocus = useRef(false);

  useEffect(() => {
    if (handled.current === state) return;
    handled.current = state;
    if (state.tone === "status") onChanged();
  }, [state, onChanged]);

  const confirming = confirmedFor === state && post.isQuestion && !post.hidden;
  const edits = editCountLabel(post.editCount);

  function askFirst(event: MouseEvent<HTMLButtonElement>) {
    if (!post.isQuestion || post.hidden) return;
    event.preventDefault();
    setConfirmedFor(state);
  }

  function cancel() {
    returnFocus.current = true;
    setConfirmedFor(null);
  }

  function focusOnReturn(node: HTMLButtonElement | null) {
    if (!node || node.disabled || !returnFocus.current) return;
    returnFocus.current = false;
    if (document.activeElement === document.body) node.focus();
  }

  return (
    <div className={styles.moderation}>
      <form
        action={formAction}
        className={styles.controls}
        onSubmit={() => {
          returnFocus.current = true;
        }}
      >
        <input type="hidden" name="postId" value={post.id} />
        <input type="hidden" name="threadId" value={threadId} />
        <input type="hidden" name="hide" value={post.hidden ? "false" : "true"} />
        {confirming ? (
          <div className={styles.confirm} role="group" aria-labelledby={warningId}>
            <p id={warningId} className={styles.warning}>
              {moderationCopy.questionWarning}
            </p>
            <div className={styles.controls}>
              <button type="submit" className={styles.button} disabled={pending} autoFocus>
                {moderationCopy.confirmHide}
              </button>
              <button type="button" className={styles.button} onClick={cancel}>
                {moderationCopy.cancel}
              </button>
            </div>
          </div>
        ) : (
          <button
            ref={focusOnReturn}
            type="submit"
            className={styles.button}
            aria-label={hideLabel(post.authorName, post.hidden)}
            disabled={pending}
            onClick={askFirst}
          >
            {hideWord(post.hidden)}
          </button>
        )}
      </form>
      {post.editCount > 0 || post.hidden ? (
        <PostHistory postId={post.id} authorName={post.authorName} version={`${post.editCount}:${post.hidden}`} />
      ) : null}
      {edits ? <span className={styles.fact}>{edits}</span> : null}
      <p className={styles.message} role="status">
        {state.tone === "status" ? state.message : ""}
      </p>
      <p className={styles.message} role="alert">
        {state.tone === "alert" ? state.message : ""}
      </p>
    </div>
  );
}
