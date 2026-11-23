import type { SupabaseClient } from "@supabase/supabase-js";
import { listStudentClasses } from "@/lib/classes";
import type { Database } from "@/lib/database.types";
import { loadMyGrades } from "@/lib/grades";
import { loadActivities } from "@/lib/quiz";
import { pickDeadlines, type DeadlineGroups } from "./helpers";

export async function loadDeadlines(
  supabase: SupabaseClient<Database>,
  studentId: string,
): Promise<{ groups: DeadlineGroups; now: number }> {
  const [activities, cells, classes] = await Promise.all([
    loadActivities(supabase),
    loadMyGrades(supabase),
    listStudentClasses(supabase, studentId),
  ]);
  const now = Date.now();
  return { groups: pickDeadlines(activities, cells, classes, now), now };
}
