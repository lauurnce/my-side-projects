import { BracketLabel } from "@/components/ui/BracketLabel";
import type { CurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { loadClassThreads, threadsFor, type ThreadTarget } from "@/lib/threads";
import { AskForm } from "./lists/AskForm";
import { questionCountLabel } from "./lists/helpers";
import styles from "./lists/lists.module.css";
import { ThreadRow } from "./lists/ThreadRow";

export type QuestionsSectionProps = { user: CurrentUser; classId: string; target: ThreadTarget };

export async function QuestionsSection({ classId, target }: QuestionsSectionProps) {
  const threads = threadsFor(await loadClassThreads(await createClient(), classId), target);
  const width = "lessonId" in target ? styles.lessonWidth : styles.activityWidth;

  return (
    <section className={`${styles.block} ${width}`} aria-labelledby="questions-title">
      <div className={styles.head}>
        <h2 id="questions-title" className={styles.title}>
          Questions
        </h2>
        <BracketLabel>{questionCountLabel(threads.length)}</BracketLabel>
      </div>
      {threads.length > 0 ? (
        <ul className={styles.rows}>
          {threads.map((thread) => (
            <ThreadRow key={thread.id} thread={thread} />
          ))}
        </ul>
      ) : (
        <p className={styles.empty}>No questions yet. Ask the first one.</p>
      )}
      <AskForm classId={classId} target={target} />
    </section>
  );
}
