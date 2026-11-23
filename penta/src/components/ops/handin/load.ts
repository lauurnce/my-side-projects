import type { Activity } from "@/lib/quiz";
import { loadOwnSubmission, type Submission } from "@/lib/submissions";
import { createClient } from "@/lib/supabase/server";

export type HandInData = { submission: Submission | null; now: number };

export async function loadHandIn(activity: Activity, studentId: string): Promise<HandInData> {
  const supabase = await createClient();
  const submission = await loadOwnSubmission(supabase, activity.id, studentId);
  return { submission, now: Date.now() };
}
