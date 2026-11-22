import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";
import { QuizPaper } from "@/components/ops/QuizPaper";
import { QuizResult } from "@/components/ops/QuizResult";
import { requireRole } from "@/lib/auth";
import { loadActivity, loadPaper, loadReview } from "@/lib/quiz";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Quiz attempt · PENTA" };

const paramsSchema = z.object({ id: z.uuid(), attemptId: z.uuid() });

export default async function AttemptPage({ params }: PageProps<"/ops/[id]/attempt/[attemptId]">) {
  await requireRole("student");
  const ids = paramsSchema.safeParse(await params);
  if (!ids.success) notFound();

  const supabase = await createClient();
  const paper = await loadPaper(supabase, ids.data.attemptId);
  if (paper.status === "not_found" || paper.activityId !== ids.data.id) notFound();

  const activity = await loadActivity(supabase, ids.data.id);
  if (!activity) notFound();

  if (paper.status === "open") return <QuizPaper activity={activity} attemptId={ids.data.attemptId} paper={paper} />;

  const review = await loadReview(supabase, ids.data.attemptId);
  if (review.status !== "submitted") notFound();
  return <QuizResult activity={activity} attemptId={ids.data.attemptId} review={review} />;
}
