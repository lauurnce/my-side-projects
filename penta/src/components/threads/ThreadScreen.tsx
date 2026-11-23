"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { addPost } from "@/app/threads/actions";
import { BracketLabel } from "@/components/ui/BracketLabel";
import { StatusChip } from "@/components/ui/StatusChip";
import type { CurrentUser } from "@/lib/auth";
import { groupPosts, threadTargetHref, type OpenThread } from "@/lib/threads";
import { PostCard, type PostMode } from "./screen/PostCard";
import { PostForm } from "./screen/PostForm";
import styles from "./screen/screen.module.css";
import { ThreadModeration } from "./ThreadModeration";
import { useThreadLive } from "./useThreadLive";

export type ThreadScreenProps = { user: CurrentUser; initial: OpenThread };

type OpenForm = { postId: string; mode: PostMode };

const closedForm: OpenForm = { postId: "", mode: null };

function ThreadGone() {
  return (
    <div className={styles.page}>
      <h1 className={styles.gone}>This question is no longer available.</h1>
      <Link href="/classes" className={styles.back}>
        Back to your classes
      </Link>
    </div>
  );
}

export function ThreadScreen({ initial }: ThreadScreenProps) {
  const { view, link, refresh } = useThreadLive(initial);
  const [open, setOpen] = useState(closedForm);
  const latestRefresh = useRef(refresh);

  useEffect(() => {
    latestRefresh.current = refresh;
  }, [refresh]);

  const changed = useCallback(() => {
    void latestRefresh.current();
  }, []);
  const setMode = useCallback((postId: string, mode: PostMode) => setOpen({ postId, mode }), []);

  if (!view) return <ThreadGone />;

  const { thread, posts } = view;
  const modeOf = (postId: string) => (open.postId === postId ? open.mode : null);
  const card = (post: OpenThread["posts"][number]) => (
    <PostCard
      post={post}
      threadId={thread.id}
      locked={thread.locked}
      canModerate={thread.canModerate}
      mode={modeOf(post.id)}
      onMode={setMode}
      onChanged={changed}
    />
  );

  return (
    <div className={styles.page}>
      <Link href={threadTargetHref(thread)} className={styles.back}>
        <span>
          Back to <bdi>{thread.targetTitle || "the class"}</bdi>
        </span>
      </Link>
      <header className={styles.header}>
        <p className={styles.labels}>
          <BracketLabel>Layer 03 · Ops</BracketLabel>
          <BracketLabel>Question</BracketLabel>
          {thread.locked ? (
            <StatusChip status="due" dot={false}>
              Locked
            </StatusChip>
          ) : null}
        </p>
        <h1 className={styles.title}>
          <bdi>{thread.title}</bdi>
        </h1>
        {thread.canModerate ? <ThreadModeration thread={thread} onChanged={changed} /> : null}
      </header>
      {link === "catching_up" ? (
        <p className={styles.paused}>Live updates are paused. New replies appear within a few seconds.</p>
      ) : null}
      <ol className={styles.posts}>
        {groupPosts(posts).map(({ post, replies }) => (
          <li key={post.id} className={styles.group}>
            {card(post)}
            {replies.length > 0 ? (
              <ol className={styles.replies}>
                {replies.map((reply) => (
                  <li key={reply.id}>{card(reply)}</li>
                ))}
              </ol>
            ) : null}
          </li>
        ))}
      </ol>
      {thread.locked ? (
        <p className={styles.locked}>This thread is locked.</p>
      ) : (
        <PostForm
          action={addPost}
          label="Your answer"
          submitLabel="Post answer"
          target={{ threadId: thread.id }}
          onDone={changed}
        />
      )}
      {thread.canModerate ? null : <p className={styles.report}>Something wrong? Tell your teacher.</p>}
    </div>
  );
}
