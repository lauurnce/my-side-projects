import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";
import { StudentClass } from "@/components/classes/StudentClass";
import { TeacherClass } from "@/components/classes/TeacherClass";
import { ClassThreads } from "@/components/threads/ClassThreads";
import { requireUser } from "@/lib/auth";

export const metadata: Metadata = { title: "Class · PENTA" };

const classIdSchema = z.uuid();

export default async function ClassPage({ params }: PageProps<"/classes/[id]">) {
  const user = await requireUser();
  const classId = classIdSchema.safeParse((await params).id);
  if (!classId.success) notFound();

  return (
    <>
      {user.role === "teacher" ? (
        <TeacherClass user={user} classId={classId.data} />
      ) : (
        <StudentClass user={user} classId={classId.data} />
      )}
      <ClassThreads user={user} classId={classId.data} />
    </>
  );
}
