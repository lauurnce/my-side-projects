import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";
import { QuizResults } from "@/components/ops/QuizResults";
import { requireRole } from "@/lib/auth";
import { isClassOwner } from "@/lib/classes";
import { loadActivity } from "@/lib/quiz";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Quiz results · PENTA" };

const activityIdSchema = z.uuid();

export default async function ResultsPage({ params }: PageProps<"/ops/[id]/results">) {
  const user = await requireRole("teacher");
  const activityId = activityIdSchema.safeParse((await params).id);
  if (!activityId.success) notFound();

  const supabase = await createClient();
  const activity = await loadActivity(supabase, activityId.data);
  if (!activity || !(await isClassOwner(supabase, activity.classId, user.id))) notFound();

  return <QuizResults user={user} activity={activity} />;
}
