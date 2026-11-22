import { notFound } from "next/navigation";
import { formatManilaDate } from "@/app/classes/student-join";
import type { CurrentUser } from "@/lib/auth";
import { unknownTeacherName } from "@/lib/classes";
import { loadClassDecks } from "@/lib/decks";
import { loadLiveDecks } from "@/lib/live";
import { loadClassOutline } from "@/lib/routes";
import { createClient } from "@/lib/supabase/server";
import { ClassDetail } from "./student/ClassDetail";

export async function StudentClass({ user, classId }: { user: CurrentUser; classId: string }) {
  const supabase = await createClient();
  const { data: enrolledClass } = await supabase
    .from("classes")
    .select("id, code, title, section, term, teacher_id")
    .eq("id", classId)
    .maybeSingle();
  if (!enrolledClass) notFound();

  const [{ data: teacher }, { data: enrollment }, outline, decks, live] = await Promise.all([
    supabase.from("profiles").select("full_name").eq("id", enrolledClass.teacher_id).maybeSingle(),
    supabase
      .from("enrollments")
      .select("joined_at")
      .eq("class_id", classId)
      .eq("student_id", user.id)
      .maybeSingle(),
    loadClassOutline(supabase, classId, user.id),
    loadClassDecks(supabase, classId, user.id),
    loadLiveDecks(supabase),
  ]);
  if (!enrollment) notFound();

  return (
    <ClassDetail
      classId={enrolledClass.id}
      code={enrolledClass.code}
      section={enrolledClass.section}
      term={enrolledClass.term}
      title={enrolledClass.title}
      teacherName={teacher?.full_name || unknownTeacherName}
      joinedOn={formatManilaDate(enrollment.joined_at)}
      outline={outline}
      decks={decks}
      live={live}
    />
  );
}
