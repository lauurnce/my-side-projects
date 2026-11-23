import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { gradebookModel, type GradebookModel } from "@/lib/gradebook";
import { loadClassGradebook } from "@/lib/grades";
import { loadClassActivities } from "@/lib/quiz";

type Supabase = SupabaseClient<Database>;
type RosterStudent = { id: string; fullName: string };

export type GradebookData =
  | { status: "not_found" }
  | { status: "failed" }
  | { status: "ready"; code: string; title: string; students: number; model: GradebookModel };

const unknownStudentName = "Unknown student";

async function loadRoster(supabase: Supabase, classId: string): Promise<RosterStudent[] | null> {
  const { data: enrollments, error } = await supabase.from("enrollments").select("student_id").eq("class_id", classId);
  if (error || !enrollments) return null;
  if (enrollments.length === 0) return [];

  const studentIds = enrollments.map((enrollment) => enrollment.student_id);
  const { data: profiles, error: profilesError } = await supabase
    .from("profiles")
    .select("id, full_name")
    .in("id", studentIds);
  if (profilesError || !profiles) return null;

  const names = new Map(profiles.map((profile) => [profile.id, profile.full_name]));
  return studentIds.map((id) => ({ id, fullName: names.get(id) || unknownStudentName }));
}

export async function loadGradebook(supabase: Supabase, classId: string, teacherId: string): Promise<GradebookData> {
  const { data: classRow } = await supabase
    .from("classes")
    .select("code, title")
    .eq("id", classId)
    .eq("teacher_id", teacherId)
    .maybeSingle();
  if (!classRow) return { status: "not_found" };

  const [activities, roster, cells] = await Promise.all([
    loadClassActivities(supabase, classId),
    loadRoster(supabase, classId),
    loadClassGradebook(supabase, classId),
  ]);
  if (!roster) return { status: "failed" };

  const published = activities.filter((activity) => activity.publishedAt !== null);
  const model = gradebookModel({ activities: published, roster, cells });
  if (!model.complete) return { status: "failed" };
  return { status: "ready", code: classRow.code, title: classRow.title, students: roster.length, model };
}
