import Link from "next/link";
import { notFound } from "next/navigation";
import { countLabel } from "@/components/classes/teacher/helpers";
import { BracketLabel } from "@/components/ui/BracketLabel";
import type { CurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { GradebookTable } from "./gradebook/GradebookTable";
import { loadGradebook } from "./gradebook/load";
import styles from "./gradebook/gradebook.module.css";

export type ClassGradebookProps = { user: CurrentUser; classId: string };

export async function ClassGradebook({ user, classId }: ClassGradebookProps) {
  const supabase = await createClient();
  const data = await loadGradebook(supabase, classId, user.id);
  if (data.status === "not_found") notFound();

  return (
    <div className={styles.page}>
      <Link className={styles.back} href={`/classes/${classId}`}>
        Back to the class
      </Link>
      {data.status === "failed" ? (
        <>
          <header className={styles.head}>
            <div className={styles.labels}>
              <BracketLabel>Gradebook</BracketLabel>
            </div>
            <h1 className={styles.title}>Gradebook</h1>
          </header>
          <p role="alert" className={styles.notice}>
            Could not load every grade. Reload the page.
          </p>
        </>
      ) : (
        <>
          <header className={styles.head}>
            <div className={styles.labels}>
              <BracketLabel>Gradebook</BracketLabel>
              <BracketLabel>{data.code}</BracketLabel>
            </div>
            <h1 className={styles.title} dir="auto">
              {data.title}
            </h1>
            <div className={styles.summaryRow}>
              <p className={styles.summary}>
                {countLabel(data.students, "student", "students")} ·{" "}
                {countLabel(data.model.columns.length, "activity", "activities")}
              </p>
              <a className={styles.export} href={`/classes/${classId}/grades.csv`} download>
                Export CSV
              </a>
            </div>
          </header>
          <GradebookTable model={data.model} />
        </>
      )}
    </div>
  );
}
