"use client";

import { memo, useCallback } from "react";
import { addPost, editPost } from "@/app/threads/actions";
import { PostModeration } from "@/components/threads/PostModeration";
import { FilterPill } from "@/components/ui/FilterPill";
import { formatManilaShort } from "@/lib/manila-time";
import type { ThreadPost } from "@/lib/threads";
import { PostBody } from "./PostBody";
import { PostForm } from "./PostForm";
import styles from "./screen.module.css";

export type PostMode = "reply" | "edit" | null;

export type PostCardProps = {
  post: ThreadPost;
  threadId: string;
  locked: boolean;
  canModerate: boolean;
  mode: PostMode;
  onMode: (postId: string, mode: PostMode) => void;
  onChanged: () => void;
};

function PostCardView({ post, threadId, locked, canModerate, mode, onMode, onChanged }: PostCardProps) {
  const canReply = !locked && post.parentId === null;
  const canEdit = !locked && post.canEdit;
  const hiddenHere = canModerate && post.hidden;
  const toggle = (next: PostMode) => onMode(post.id, mode === next ? null : next);
  const close = useCallback(() => onMode(post.id, null), [onMode, post.id]);
  const finish = useCallback(() => {
    onMode(post.id, null);
    onChanged();
  }, [onMode, onChanged, post.id]);

  return (
    <article className={hiddenHere ? styles.postHidden : styles.post} data-post-id={post.id}>
      <p className={styles.meta}>
        <bdi className={styles.author}>{post.authorName}</bdi>
        {post.authorRole === "teacher" ? (
          <span className={styles.role} data-role-label="">
            Teacher
          </span>
        ) : null}
        {post.mine ? <span className={styles.tag}>You</span> : null}
        <time dateTime={post.createdAt}>{formatManilaShort(post.createdAt)}</time>
        {post.editedAt ? <span>edited</span> : null}
        {hiddenHere ? <strong className={styles.hiddenMark}>Hidden from students</strong> : null}
        {canModerate && !post.authorInClass ? <span className={styles.tag}>No longer in this class</span> : null}
      </p>
      {mode === "edit" && canEdit ? (
        <PostForm
          action={editPost}
          label="Edit your post"
          submitLabel="Save edit"
          target={{ postId: post.id }}
          initialBody={post.body}
          showEditRule
          autoFocus
          onDone={finish}
          onCancel={close}
        />
      ) : (
        <PostBody body={post.body} />
      )}
      <div className={styles.actions}>
        {canReply ? (
          <FilterPill className={styles.ghost} aria-expanded={mode === "reply"} onClick={() => toggle("reply")}>
            Reply
          </FilterPill>
        ) : null}
        {canEdit ? (
          <FilterPill className={styles.ghost} aria-expanded={mode === "edit"} onClick={() => toggle("edit")}>
            Edit
          </FilterPill>
        ) : null}
        {canModerate ? <PostModeration post={post} onChanged={onChanged} /> : null}
      </div>
      {mode === "reply" && canReply ? (
        <PostForm
          action={addPost}
          label="Your reply"
          submitLabel="Post reply"
          target={{ threadId, parentId: post.id }}
          autoFocus
          onDone={finish}
        />
      ) : null}
    </article>
  );
}

function samePost(previous: PostCardProps, next: PostCardProps): boolean {
  return (
    previous.post.id === next.post.id &&
    previous.post.body === next.post.body &&
    previous.post.editedAt === next.post.editedAt &&
    previous.post.hidden === next.post.hidden &&
    previous.post.canEdit === next.post.canEdit &&
    previous.post.authorInClass === next.post.authorInClass &&
    previous.threadId === next.threadId &&
    previous.locked === next.locked &&
    previous.canModerate === next.canModerate &&
    previous.mode === next.mode &&
    previous.onMode === next.onMode &&
    previous.onChanged === next.onChanged
  );
}

export const PostCard = memo(PostCardView, samePost);
