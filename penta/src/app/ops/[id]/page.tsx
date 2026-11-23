import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";
import { QuizBuilder } from "@/components/ops/QuizBuilder";
import { QuizOverview } from "@/components/ops/QuizOverview";
import { UploadBuilder } from "@/components/ops/UploadBuilder";
import { UploadOverview } from "@/components/ops/UploadOverview";
import { requireUser } from "@/lib/auth";
import { isClassOwner } from "@/lib/classes";
import { loadActivity } from "@/lib/quiz";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Activity · PENTA" };

const activityIdSchema = z.uuid();

export default async function ActivityPage({ params }: PageProps<"/ops/[id]">) {
  const user = await requireUser();
  const activityId = activityIdSchema.safeParse((await params).id);
  if (!activityId.success) notFound();

  const supabase = await createClient();
  const activity = await loadActivity(supabase, activityId.data);
  if (!activity) notFound();

  const isUpload = activity.type === "upload";
  if (await isClassOwner(supabase, activity.classId, user.id)) {
    return isUpload ? <UploadBuilder user={user} activity={activity} /> : <QuizBuilder user={user} activity={activity} />;
  }
  if (user.role !== "student") notFound();
  return isUpload ? <UploadOverview user={user} activity={activity} /> : <QuizOverview user={user} activity={activity} />;
}
