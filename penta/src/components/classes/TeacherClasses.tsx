import type { CurrentUser } from "@/lib/auth";
import { withProgress } from "@/lib/classes";
import { loadOutlines } from "@/lib/routes";
import { createClient } from "@/lib/supabase/server";
import { BracketLabel } from "@/components/ui/BracketLabel";
import { ClassList, type ClassListItem } from "./teacher/ClassList";
import { CreateClassForm } from "./teacher/CreateClassForm";
import { countByClass, countLabel } from "./teacher/helpers";
import styles from "./teacher/teacher.module.css";

async function loadClasses(teacherId: string): Promise<ClassListItem[] | null> {
  const supabase = await createClient();
  const { data: classes, error } = await supabase
    .from("classes")
    .select("id, code, title, section, term, created_at")
    .eq("teacher_id", teacherId)
    .order("created_at", { ascending: false });
  if (error) return null;
  if (classes.length === 0) return [];

  const [{ data: enrollments, error: enrollmentsError }, outlines] = await Promise.all([
    supabase
      .from("enrollments")
      .select("class_id")
      .in(
        "class_id",
        classes.map((item) => item.id),
      ),
    loadOutlines(supabase, teacherId),
  ]);
  if (enrollmentsError) return null;

  const counts = countByClass(enrollments);
  return withProgress(classes, outlines).map((item) => ({
    id: item.id,
    code: item.code,
    title: item.title,
    section: item.section,
    term: item.term,
    studentCount: counts.get(item.id) ?? 0,
    published: item.published,
    drafts: item.drafts,
  }));
}

export async function TeacherClasses({ user }: { user: CurrentUser }) {
  const classes = await loadClasses(user.id);

  return (
    <div className={styles.page}>
      <header className={styles.head}>
        <div className={styles.labels}>
          <BracketLabel>Layer 01 Routes</BracketLabel>
          {classes && <BracketLabel>{countLabel(classes.length, "class", "classes")}</BracketLabel>}
        </div>
        <h1 className={styles.title}>Your classes</h1>
      </header>
      {classes ? (
        <ClassList classes={classes} />
      ) : (
        <p role="alert" className={styles.notice}>
          Could not load your classes
        </p>
      )}
      <section className={styles.section} aria-labelledby="create-class-title">
        <h2 id="create-class-title" className={styles.sectionTitle}>
          Create a class
        </h2>
        <CreateClassForm />
      </section>
    </div>
  );
}
