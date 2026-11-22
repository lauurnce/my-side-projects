import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";
import { QuizBuilder } from "@/components/ops/QuizBuilder";
import { QuizOverview } from "@/components/ops/QuizOverview";
import { requireUser } from "@/lib/auth";
import { isClassOwner } from "@/lib/classes";
import { loadActivity } from "@/lib/quiz";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Quiz · PENTA" };

const activityIdSchema = z.uuid();

export default async function ActivityPage({ params }: PageProps<"/ops/[id]">) {
  const user = await requireUser();
  const activityId = activityIdSchema.safeParse((await params).id);
  if (!activityId.success) notFound();

  const supabase = await createClient();
  const activity = await loadActivity(supabase, activityId.data);
  if (!activity) notFound();

  if (await isClassOwner(supabase, activity.classId, user.id)) return <QuizBuilder user={user} activity={activity} />;
  if (user.role !== "student") notFound();
  return <QuizOverview user={user} activity={activity} />;
}
