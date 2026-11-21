"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import {
  lessonDoneError,
  lessonDoneMessages,
  lessonDoneSaved,
  lessonDoneSchema,
  progressErrorMessage,
  type LessonDoneState,
} from "./lesson-messages";

type SaveOutcome = { classId: string } | { failure: string };

async function saveProgress(lessonId: string, studentId: string, done: boolean): Promise<SaveOutcome> {
  const supabase = await createClient();
  const { data: lesson } = await supabase
    .from("lessons")
    .select("id, modules!inner(class_id)")
    .eq("id", lessonId)
    .maybeSingle();
  if (!lesson) return { failure: lessonDoneMessages.unavailable };

  const { error } = done
    ? await supabase
        .from("lesson_progress")
        .upsert(
          { lesson_id: lessonId, student_id: studentId },
          { onConflict: "lesson_id,student_id", ignoreDuplicates: true },
        )
        .select("lesson_id")
    : await supabase
        .from("lesson_progress")
        .delete()
        .eq("lesson_id", lessonId)
        .eq("student_id", studentId)
        .select("lesson_id");
  if (error) return { failure: progressErrorMessage(error.code) };

  return { classId: lesson.modules.class_id };
}

export async function setLessonDone(_previousState: LessonDoneState, formData: FormData): Promise<LessonDoneState> {
  const user = await requireRole("student");

  const parsed = lessonDoneSchema.safeParse({ lessonId: formData.get("lessonId"), done: formData.get("done") });
  if (!parsed.success) return lessonDoneError(lessonDoneMessages.failed);

  const { lessonId, done } = parsed.data;
  const outcome = await saveProgress(lessonId, user.id, done).catch(
    (): SaveOutcome => ({ failure: lessonDoneMessages.failed }),
  );
  if ("failure" in outcome) return lessonDoneError(outcome.failure);

  revalidatePath(`/classes/${outcome.classId}/lessons/${lessonId}`);
  revalidatePath(`/classes/${outcome.classId}`);
  revalidatePath("/classes");
  revalidatePath("/hub");
  return lessonDoneSaved(done);
}
