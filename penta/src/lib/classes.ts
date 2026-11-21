import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

type Tables = Database["public"]["Tables"];
type ClassRow = Pick<Tables["classes"]["Row"], "id" | "code" | "title" | "section" | "term" | "teacher_id">;
type TeacherRow = Pick<Tables["profiles"]["Row"], "id" | "full_name">;

export type StudentClassSummary = {
  id: string;
  code: string;
  title: string;
  section: string;
  term: string;
  teacherName: string;
};

export const unknownTeacherName = "Teacher";

export function toStudentClasses(classes: ClassRow[], teachers: TeacherRow[]): StudentClassSummary[] {
  const teacherNames = new Map(teachers.map((teacher) => [teacher.id, teacher.full_name]));
  return classes
    .map((row) => ({
      id: row.id,
      code: row.code,
      title: row.title,
      section: row.section,
      term: row.term,
      teacherName: teacherNames.get(row.teacher_id) || unknownTeacherName,
    }))
    .sort((first, second) => first.title.localeCompare(second.title, "en"));
}

export async function listStudentClasses(
  supabase: SupabaseClient<Database>,
  studentId: string,
): Promise<StudentClassSummary[]> {
  const { data: enrollments } = await supabase.from("enrollments").select("class_id").eq("student_id", studentId);
  const classIds = (enrollments ?? []).map((enrollment) => enrollment.class_id);
  if (classIds.length === 0) return [];

  const { data: classes } = await supabase
    .from("classes")
    .select("id, code, title, section, term, teacher_id")
    .in("id", classIds);
  if (!classes || classes.length === 0) return [];

  const teacherIds = [...new Set(classes.map((row) => row.teacher_id))];
  const { data: teachers } = await supabase.from("profiles").select("id, full_name").in("id", teacherIds);
  return toStudentClasses(classes, teachers ?? []);
}

export type TeacherClassSummary = Omit<StudentClassSummary, "teacherName">;

export async function listTeacherClasses(
  supabase: SupabaseClient<Database>,
  teacherId: string,
): Promise<TeacherClassSummary[]> {
  const { data } = await supabase
    .from("classes")
    .select("id, code, title, section, term")
    .eq("teacher_id", teacherId)
    .order("title");
  return data ?? [];
}
