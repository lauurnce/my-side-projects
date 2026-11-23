import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AltitudePanel } from "@/components/grades/AltitudePanel";
import { Deadlines } from "@/components/grades/Deadlines";
import { MyGrades } from "@/components/grades/MyGrades";
import styles from "@/components/grades/grades-page.module.css";
import { requireUser } from "@/lib/auth";

export const metadata: Metadata = { title: "Grades · PENTA" };

export default async function GradesPage() {
  const user = await requireUser();
  if (user.role !== "student") redirect("/classes");

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>Grades</h1>
      <AltitudePanel user={user} />
      <Deadlines user={user} />
      <MyGrades user={user} />
    </div>
  );
}
