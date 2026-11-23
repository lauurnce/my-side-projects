import Link from "next/link";
import { StatusChip } from "@/components/ui/StatusChip";
import { formatManilaShort } from "@/lib/manila-time";
import type { ThreadSummary } from "@/lib/threads";
import { hiddenCountLabel, replyCountLabel } from "./helpers";
import styles from "./lists.module.css";

export type ThreadRowProps = { thread: ThreadSummary; showTarget?: boolean };

export function ThreadRow({ thread, showTarget = false }: ThreadRowProps) {
  const hiddenCount = hiddenCountLabel(thread.hiddenPosts);

  return (
    <li className={styles.row}>
      <Link href={`/threads/${thread.id}`} className={styles.rowTitle}>
        <bdi>{thread.title}</bdi>
      </Link>
      <p className={styles.rowMeta}>
        <span>
          by <bdi>{thread.authorName}</bdi>
        </span>
        {thread.authorRole === "teacher" ? (
          <span className={styles.role} data-role-label="">
            Teacher
          </span>
        ) : null}
        {showTarget && thread.targetTitle ? (
          <span>
            on <bdi>{thread.targetTitle}</bdi>
          </span>
        ) : null}
        <span>{replyCountLabel(thread.replies)}</span>
        <span>{formatManilaShort(thread.lastPostAt ?? thread.createdAt)}</span>
        {thread.locked ? (
          <StatusChip status="due" dot={false}>
            Locked
          </StatusChip>
        ) : null}
        {hiddenCount ? <span className={styles.flag}>{hiddenCount}</span> : null}
        {thread.questionHidden ? <span className={styles.flag}>Question hidden from students</span> : null}
      </p>
    </li>
  );
}
