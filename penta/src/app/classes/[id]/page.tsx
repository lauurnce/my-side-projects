import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";
import { StudentClass } from "@/components/classes/StudentClass";
import { TeacherClass } from "@/components/classes/TeacherClass";
import { requireUser } from "@/lib/auth";

export const metadata: Metadata = { title: "Class · PENTA" };

const classIdSchema = z.uuid();

export default async function ClassPage({ params }: PageProps<"/classes/[id]">) {
  const user = await requireUser();
  const classId = classIdSchema.safeParse((await params).id);
  if (!classId.success) notFound();

  if (user.role === "teacher") return <TeacherClass user={user} classId={classId.data} />;
  return <StudentClass user={user} classId={classId.data} />;
}
