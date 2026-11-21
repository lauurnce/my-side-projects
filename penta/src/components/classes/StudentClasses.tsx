import { joinClass } from "@/app/classes/student-actions";
import type { CurrentUser } from "@/lib/auth";
import { listStudentClasses } from "@/lib/classes";
import { createClient } from "@/lib/supabase/server";
import { ClassList } from "./student/ClassList";
import { ClassesHeader } from "./student/ClassesHeader";
import { JoinForm } from "./student/JoinForm";
import styles from "./student/student.module.css";

export async function StudentClasses({ user }: { user: CurrentUser }) {
  const supabase = await createClient();
  const classes = await listStudentClasses(supabase, user.id);

  return (
    <div className={styles.page}>
      <ClassesHeader count={classes.length} />
      <JoinForm action={joinClass} />
      <ClassList classes={classes} />
    </div>
  );
}
