import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";
import { LessonReader } from "@/components/lessons/LessonReader";
import { requireUser } from "@/lib/auth";
import { isClassOwner } from "@/lib/classes";
import { loadLesson } from "@/lib/routes";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Lesson · PENTA" };

const paramsSchema = z.object({ id: z.uuid(), lessonId: z.uuid() });

export default async function LessonPage({ params }: PageProps<"/classes/[id]/lessons/[lessonId]">) {
  const user = await requireUser();
  const ids = paramsSchema.safeParse(await params);
  if (!ids.success) notFound();

  const supabase = await createClient();
  const lesson = await loadLesson(supabase, ids.data.id, ids.data.lessonId);
  if (!lesson) notFound();

  const isOwner = await isClassOwner(supabase, lesson.classId, user.id);
  return <LessonReader user={user} lesson={lesson} isOwner={isOwner} />;
}
