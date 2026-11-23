import Link from "next/link";
import type { CurrentUser } from "@/lib/auth";
import { listStudentClasses } from "@/lib/classes";
import { countingNote, gradebookModel } from "@/lib/gradebook";
import { loadMyGrades } from "@/lib/grades";
import { loadActivities } from "@/lib/quiz";
import { createClient } from "@/lib/supabase/server";
import { ClassGrades } from "./mine/ClassGrades";
import styles from "./mine/mine.module.css";

export type MyGradesProps = { user: CurrentUser };

export async function MyGrades({ user }: MyGradesProps) {
  const supabase = await createClient();
  const [classes, activities, ownCells] = await Promise.all([
    listStudentClasses(supabase, user.id),
    loadActivities(supabase),
    loadMyGrades(supabase),
  ]);

  if (classes.length === 0) {
    return (
      <div className={styles.wrap}>
        <p className={styles.empty}>
          <Link href="/classes">Join a class</Link> to see grades here.
        </p>
      </div>
    );
  }

  const roster = [{ id: user.id, fullName: user.fullName }];
  const published = activities.filter((activity) => activity.publishedAt !== null);

  return (
    <div className={styles.wrap}>
      {classes.map((item) => (
        <ClassGrades
          key={item.id}
          classId={item.id}
          code={item.code}
          title={item.title}
          model={gradebookModel({
            activities: published.filter((activity) => activity.classId === item.id),
            roster,
            cells: ownCells
              .filter((cell) => cell.classId === item.id)
              .map((cell) => ({ ...cell, studentId: user.id })),
          })}
        />
      ))}
      <p className={styles.note}>{countingNote}</p>
    </div>
  );
}
