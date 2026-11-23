import { BracketLabel } from "@/components/ui/BracketLabel";
import type { CurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { loadClassThreads } from "@/lib/threads";
import { classThreadsShown, moreLabel, newestFirst, questionCountLabel } from "./lists/helpers";
import styles from "./lists/lists.module.css";
import { ThreadRow } from "./lists/ThreadRow";

export type ClassThreadsProps = { user: CurrentUser; classId: string };

export async function ClassThreads({ user, classId }: ClassThreadsProps) {
  const threads = newestFirst(await loadClassThreads(await createClient(), classId));
  const width = user.role === "teacher" ? styles.teacherWidth : styles.studentWidth;
  const more = moreLabel(threads.length);

  return (
    <section className={`${styles.block} ${width}`} aria-labelledby="class-threads-title">
      <div className={styles.head}>
        <h2 id="class-threads-title" className={styles.title}>
          Questions in this class
        </h2>
        <BracketLabel>{questionCountLabel(threads.length)}</BracketLabel>
      </div>
      {threads.length > 0 ? (
        <ul className={styles.rows}>
          {threads.slice(0, classThreadsShown).map((thread) => (
            <ThreadRow key={thread.id} thread={thread} showTarget />
          ))}
        </ul>
      ) : (
        <p className={styles.empty}>No questions in this class yet. Ask one from a lesson or an activity.</p>
      )}
      {more ? <p className={styles.more}>{more}</p> : null}
    </section>
  );
}
