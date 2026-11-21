import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";
import { LessonEditor } from "@/components/lessons/LessonEditor";
import { requireRole } from "@/lib/auth";
import { isClassOwner } from "@/lib/classes";
import { loadLesson } from "@/lib/routes";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Edit lesson · PENTA" };

const paramsSchema = z.object({ id: z.uuid(), lessonId: z.uuid() });

export default async function EditLessonPage({ params }: PageProps<"/classes/[id]/lessons/[lessonId]/edit">) {
  const user = await requireRole("teacher");
  const ids = paramsSchema.safeParse(await params);
  if (!ids.success) notFound();

  const supabase = await createClient();
  const lesson = await loadLesson(supabase, ids.data.id, ids.data.lessonId);
  if (!lesson || !(await isClassOwner(supabase, lesson.classId, user.id))) notFound();

  return <LessonEditor lesson={lesson} />;
}
