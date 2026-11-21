import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { removeStudent } from "@/app/classes/teacher-actions";
import { TeacherDecks } from "@/components/decks/TeacherDecks";
import { BracketLabel } from "@/components/ui/BracketLabel";
import type { CurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { countLabel, toRosterRows, type RosterRow } from "./teacher/helpers";
import { JoinCodeBox } from "./teacher/JoinCodeBox";
import { RemovalNotice } from "./teacher/RemovalNotice";
import { Roster } from "./teacher/Roster";
import { TeacherOutline } from "./teacher/TeacherOutline";
import styles from "./teacher/teacher.module.css";

type Supabase = Awaited<ReturnType<typeof createClient>>;

async function loadRoster(supabase: Supabase, classId: string): Promise<RosterRow[] | null> {
  const { data: enrollments, error } = await supabase
    .from("enrollments")
    .select("student_id, joined_at")
    .eq("class_id", classId);
  if (error) return null;
  if (enrollments.length === 0) return [];

  const { data: profiles, error: profilesError } = await supabase
    .from("profiles")
    .select("id, full_name")
    .in(
      "id",
      enrollments.map((enrollment) => enrollment.student_id),
    );
  if (profilesError) return null;

  return toRosterRows(enrollments, profiles);
}

export async function TeacherClass({ user, classId }: { user: CurrentUser; classId: string }) {
  const supabase = await createClient();
  const { data: classRow } = await supabase
    .from("classes")
    .select("id, code, title, section, term")
    .eq("id", classId)
    .eq("teacher_id", user.id)
    .maybeSingle();
  if (!classRow) notFound();

  const [{ data: joinCode }, roster] = await Promise.all([
    supabase.rpc("class_join_code", { target_class: classId }),
    loadRoster(supabase, classId),
  ]);

  return (
    <div className={styles.page}>
      <Link className={styles.back} href="/classes">
        Back to your classes
      </Link>
      <header className={styles.head}>
        <div className={styles.labels}>
          <BracketLabel>{classRow.code}</BracketLabel>
          {classRow.section && <BracketLabel>{classRow.section}</BracketLabel>}
          {classRow.term && <BracketLabel>{classRow.term}</BracketLabel>}
        </div>
        <h1 className={styles.title}>{classRow.title}</h1>
      </header>
      <TeacherOutline user={user} classId={classRow.id} />
      <TeacherDecks user={user} classId={classRow.id} />
      <JoinCodeBox code={joinCode ?? null} />
      <section className={styles.section} aria-labelledby="roster-title">
        <div className={styles.sectionHead}>
          <h2 id="roster-title" className={styles.sectionTitle}>
            Roster
          </h2>
          {roster && <BracketLabel>{countLabel(roster.length, "student", "students")}</BracketLabel>}
        </div>
        <Suspense fallback={null}>
          <RemovalNotice />
        </Suspense>
        {roster ? (
          <Roster classId={classRow.id} rows={roster} removeAction={removeStudent} />
        ) : (
          <p role="alert" className={styles.notice}>
            Could not load the roster
          </p>
        )}
      </section>
    </div>
  );
}
