import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { ClassGradebook } from "@/components/grades/ClassGradebook";
import { requireUser } from "@/lib/auth";
import { isClassOwner } from "@/lib/classes";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Gradebook · PENTA" };

const classIdSchema = z.uuid();

export default async function ClassGradesPage({ params }: PageProps<"/classes/[id]/grades">) {
  const user = await requireUser();
  const classId = classIdSchema.safeParse((await params).id);
  if (!classId.success) notFound();
  if (user.role === "student") redirect("/grades");

  const supabase = await createClient();
  if (!(await isClassOwner(supabase, classId.data, user.id))) notFound();
  return <ClassGradebook user={user} classId={classId.data} />;
}
