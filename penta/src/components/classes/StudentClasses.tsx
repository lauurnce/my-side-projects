import { joinClass } from "@/app/classes/student-actions";
import type { CurrentUser } from "@/lib/auth";
import { listStudentClasses, withProgress } from "@/lib/classes";
import { loadOutlines } from "@/lib/routes";
import { createClient } from "@/lib/supabase/server";
import { ClassList } from "./student/ClassList";
import { ClassesHeader } from "./student/ClassesHeader";
import { JoinForm } from "./student/JoinForm";
import styles from "./student/student.module.css";

export async function StudentClasses({ user }: { user: CurrentUser }) {
  const supabase = await createClient();
  const [classes, outlines] = await Promise.all([
    listStudentClasses(supabase, user.id),
    loadOutlines(supabase, user.id),
  ]);

  return (
    <div className={styles.page}>
      <ClassesHeader count={classes.length} />
      <JoinForm action={joinClass} />
      <ClassList classes={withProgress(classes, outlines)} />
    </div>
  );
}
