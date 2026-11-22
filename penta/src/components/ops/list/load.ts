import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { loadOwnAttempts, type Activity } from "@/lib/quiz";
import type { OpsData } from "./helpers";

export async function loadOpsData(
  supabase: SupabaseClient<Database>,
  activities: Activity[],
  studentId: string | null,
): Promise<OpsData> {
  const attempts = studentId
    ? await loadOwnAttempts(
        supabase,
        studentId,
        activities.map((activity) => activity.id),
      )
    : [];
  return { activities, attempts, now: Date.now() };
}
