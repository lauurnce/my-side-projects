import type { Metadata } from "next";
import { StudentClasses } from "@/components/classes/StudentClasses";
import { TeacherClasses } from "@/components/classes/TeacherClasses";
import { requireUser } from "@/lib/auth";

export const metadata: Metadata = { title: "Classes · PENTA" };

export default async function ClassesPage() {
  const user = await requireUser();
  if (user.role === "teacher") return <TeacherClasses user={user} />;
  return <StudentClasses user={user} />;
}
