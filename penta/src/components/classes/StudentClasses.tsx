import { joinClass } from "@/app/classes/student-actions";
import { classMeters } from "@/components/grades/altitude/helpers";
import type { CurrentUser } from "@/lib/auth";
import { listStudentClasses, withProgress } from "@/lib/classes";
import { loadAltitude } from "@/lib/grades";
import { loadOutlines } from "@/lib/routes";
import { createClient } from "@/lib/supabase/server";
import { ClassList } from "./student/ClassList";
import { ClassesHeader } from "./student/ClassesHeader";
import { JoinForm } from "./student/JoinForm";
import styles from "./student/student.module.css";

export async function StudentClasses({ user }: { user: CurrentUser }) {
  const supabase = await createClient();
  const [classes, outlines, altitude] = await Promise.all([
    listStudentClasses(supabase, user.id),
    loadOutlines(supabase, user.id),
    loadAltitude(supabase, user.id),
  ]);
  const cards = withProgress(classes, outlines).map((item) => ({ ...item, meters: classMeters(altitude, item.id) }));

  return (
    <div className={styles.page}>
      <ClassesHeader count={classes.length} />
      <JoinForm action={joinClass} />
      <ClassList classes={cards} />
    </div>
  );
}
