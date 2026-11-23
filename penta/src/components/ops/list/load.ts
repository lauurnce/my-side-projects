import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { loadMyGrades } from "@/lib/grades";
import { loadOwnAttempts, type Activity } from "@/lib/quiz";
import type { OpsData } from "./helpers";

export async function loadOpsData(
  supabase: SupabaseClient<Database>,
  activities: Activity[],
  studentId: string | null,
): Promise<OpsData> {
  if (!studentId) return { activities, attempts: [], cells: [], now: Date.now() };

  const quizIds = activities.filter((activity) => activity.type === "quiz").map((activity) => activity.id);
  const hasUploads = activities.some((activity) => activity.type === "upload");
  const [attempts, cells] = await Promise.all([
    loadOwnAttempts(supabase, studentId, quizIds),
    hasUploads ? loadMyGrades(supabase) : [],
  ]);
  return { activities, attempts, cells, now: Date.now() };
}
