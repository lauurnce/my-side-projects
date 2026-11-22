"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { loadActivity } from "@/lib/quiz";
import { createClient } from "@/lib/supabase/server";
import {
  buildAnswers,
  replyStatus,
  startMessage,
  startMessages,
  startSchema,
  startedAttemptId,
  submitSchema,
  type StartState,
} from "./attempt-schema";

function revalidateQuiz(activityId: string, attemptId: string, classId: string | null) {
  if (classId) revalidatePath(`/classes/${classId}`);
  revalidatePath(`/ops/${activityId}`);
  revalidatePath(`/ops/${activityId}/attempt/${attemptId}`);
  revalidatePath(`/ops/${activityId}/results`);
  revalidatePath("/classes");
  revalidatePath("/hub");
}

export async function startQuiz(previousState: StartState, formData: FormData): Promise<StartState> {
  await requireRole("student");
  const parsed = startSchema.safeParse({ activityId: formData.get("activityId") });
  if (!parsed.success) return { message: startMessages.not_found };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("start_attempt", { target_activity: parsed.data.activityId });
  if (error) return { message: startMessages.not_found };

  const attemptId = startedAttemptId(data);
  if (!attemptId) return { message: startMessage(replyStatus(data)) };

  const activity = await loadActivity(supabase, parsed.data.activityId);
  revalidateQuiz(parsed.data.activityId, attemptId, activity?.classId ?? null);
  redirect(`/ops/${parsed.data.activityId}/attempt/${attemptId}`);
}

export async function submitQuiz(formData: FormData): Promise<void> {
  await requireRole("student");
  const parsed = submitSchema.safeParse({
    activityId: formData.get("activityId"),
    attemptId: formData.get("attemptId"),
  });
  if (!parsed.success) redirect("/hub");

  const { activityId, attemptId } = parsed.data;
  const supabase = await createClient();
  await supabase.rpc("submit_attempt", { target_attempt: attemptId, answers: buildAnswers(formData.entries()) });

  const activity = await loadActivity(supabase, activityId);
  revalidateQuiz(activityId, attemptId, activity?.classId ?? null);
  redirect(`/ops/${activityId}/attempt/${attemptId}`);
}
