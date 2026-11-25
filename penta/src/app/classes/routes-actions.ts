"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUser, requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import {
  addLessonSchema,
  addModuleSchema,
  lessonTargetSchema,
  moduleTargetSchema,
  moveLessonSchema,
  moveModuleSchema,
  moveResultState,
  outlineIntentSchema,
  renameModuleSchema,
  routeMessages,
  saveFieldErrors,
  saveLessonContentSchema,
  saveLessonTargetSchema,
  setLessonPublishedSchema,
  titleErrorMessage,
  writeErrorMessage,
  type OutlineIntent,
  type OutlineState,
  type SaveLessonState,
} from "./routes-schema";

const lessonWithClass = "id, modules!inner(class_id)";

function textValue(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

function alertState(message: string): OutlineState {
  return { tone: "alert", message };
}

function statusState(message: string): OutlineState {
  return { tone: "status", message };
}

function revalidateRoutes(classId: string, lessonId?: string) {
  revalidatePath(`/classes/${classId}`);
  if (lessonId) {
    revalidatePath(`/classes/${classId}/lessons/${lessonId}`);
    revalidatePath(`/classes/${classId}/lessons/${lessonId}/edit`);
  }
  revalidatePath("/classes");
  revalidatePath("/hub");
}

export async function addModule(formData: FormData): Promise<OutlineState> {
  await requireRole("teacher");
  const parsed = addModuleSchema.safeParse({ classId: formData.get("classId"), title: formData.get("title") });
  if (!parsed.success) return alertState(titleErrorMessage(parsed.error));

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("modules")
    .insert({ class_id: parsed.data.classId, title: parsed.data.title })
    .select("class_id");
  if (error || !data?.length) return alertState(writeErrorMessage(error));

  revalidateRoutes(data[0].class_id);
  return statusState(routeMessages.moduleAdded);
}

export async function renameModule(formData: FormData): Promise<OutlineState> {
  await requireRole("teacher");
  const parsed = renameModuleSchema.safeParse({ moduleId: formData.get("moduleId"), title: formData.get("title") });
  if (!parsed.success) return alertState(titleErrorMessage(parsed.error));

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("modules")
    .update({ title: parsed.data.title })
    .eq("id", parsed.data.moduleId)
    .select("class_id");
  if (error || !data?.length) return alertState(writeErrorMessage(error));

  revalidateRoutes(data[0].class_id);
  return statusState(routeMessages.moduleRenamed);
}

export async function deleteModule(formData: FormData): Promise<OutlineState> {
  await requireRole("teacher");
  const parsed = moduleTargetSchema.safeParse({ moduleId: formData.get("moduleId") });
  if (!parsed.success) return alertState(routeMessages.gone);

  const supabase = await createClient();
  const { data, error } = await supabase.from("modules").delete().eq("id", parsed.data.moduleId).select("class_id");
  if (error || !data?.length) return alertState(writeErrorMessage(error, routeMessages.moduleHasLessons));

  revalidateRoutes(data[0].class_id);
  return statusState(routeMessages.moduleDeleted);
}

export async function moveModule(formData: FormData): Promise<OutlineState> {
  await requireRole("teacher");
  const parsed = moveModuleSchema.safeParse({ moduleId: formData.get("moduleId"), step: formData.get("direction") });
  if (!parsed.success) return alertState(routeMessages.gone);

  const supabase = await createClient();
  const { data: result, error } = await supabase.rpc("move_module", {
    target: parsed.data.moduleId,
    step: parsed.data.step,
  });
  if (error) return alertState(routeMessages.failed);
  if (result !== "moved") return moveResultState(result);

  const { data: moduleRow } = await supabase
    .from("modules")
    .select("class_id")
    .eq("id", parsed.data.moduleId)
    .maybeSingle();
  if (moduleRow) revalidateRoutes(moduleRow.class_id);
  return moveResultState(result);
}

export async function addLesson(formData: FormData): Promise<OutlineState> {
  await requireRole("teacher");
  const parsed = addLessonSchema.safeParse({ moduleId: formData.get("moduleId"), title: formData.get("title") });
  if (!parsed.success) return alertState(titleErrorMessage(parsed.error));

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("lessons")
    .insert({ module_id: parsed.data.moduleId, title: parsed.data.title, body_md: "", est_minutes: 10 })
    .select(lessonWithClass);
  if (error || !data?.length) return alertState(writeErrorMessage(error));

  const classId = data[0].modules.class_id;
  revalidateRoutes(classId, data[0].id);
  redirect(`/classes/${classId}/lessons/${data[0].id}/edit`);
}

export async function moveLesson(formData: FormData): Promise<OutlineState> {
  await requireRole("teacher");
  const parsed = moveLessonSchema.safeParse({ lessonId: formData.get("lessonId"), step: formData.get("direction") });
  if (!parsed.success) return alertState(routeMessages.gone);

  const supabase = await createClient();
  const { data: result, error } = await supabase.rpc("move_lesson", {
    target: parsed.data.lessonId,
    step: parsed.data.step,
  });
  if (error) return alertState(routeMessages.failed);
  if (result !== "moved") return moveResultState(result);

  const { data: lesson } = await supabase
    .from("lessons")
    .select(lessonWithClass)
    .eq("id", parsed.data.lessonId)
    .maybeSingle();
  if (lesson) revalidateRoutes(lesson.modules.class_id, lesson.id);
  return moveResultState(result);
}

export async function setLessonPublished(formData: FormData): Promise<OutlineState> {
  await requireRole("teacher");
  const parsed = setLessonPublishedSchema.safeParse({
    lessonId: formData.get("lessonId"),
    published: formData.get("published"),
  });
  if (!parsed.success) return alertState(routeMessages.gone);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("lessons")
    .update({ published_at: parsed.data.published ? new Date().toISOString() : null })
    .eq("id", parsed.data.lessonId)
    .select(lessonWithClass);
  if (error || !data?.length) return alertState(writeErrorMessage(error));

  revalidateRoutes(data[0].modules.class_id, data[0].id);
  return statusState(parsed.data.published ? routeMessages.lessonPublished : routeMessages.lessonUnpublished);
}

export async function deleteLesson(formData: FormData): Promise<OutlineState> {
  await requireRole("teacher");
  const parsed = lessonTargetSchema.safeParse({ lessonId: formData.get("lessonId") });
  if (!parsed.success) return alertState(routeMessages.gone);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("lessons")
    .delete()
    .eq("id", parsed.data.lessonId)
    .select(lessonWithClass);
  if (error || !data?.length) return alertState(writeErrorMessage(error, routeMessages.lessonHasProgress));

  revalidateRoutes(data[0].modules.class_id, data[0].id);
  return statusState(routeMessages.lessonDeleted);
}

const outlineActions: Record<OutlineIntent, (formData: FormData) => Promise<OutlineState>> = {
  addModule,
  renameModule,
  deleteModule,
  moveModule,
  addLesson,
  moveLesson,
  setLessonPublished,
  deleteLesson,
};

export async function runOutlineAction(_previousState: OutlineState, formData: FormData): Promise<OutlineState> {
  await requireRole("teacher");
  const intent = outlineIntentSchema.safeParse(formData.get("intent"));
  if (!intent.success) return alertState(routeMessages.failed);
  return outlineActions[intent.data](formData);
}

export async function saveLesson(_previousState: SaveLessonState, formData: FormData): Promise<SaveLessonState> {
  const values = {
    title: textValue(formData, "title"),
    minutes: textValue(formData, "minutes"),
    body: textValue(formData, "body").replace(/\r\n?/g, "\n"),
  };
  const seenRevision = Number(formData.get("revision"));
  if (!(await getCurrentUser())) {
    const revision = Number.isInteger(seenRevision) ? seenRevision : undefined;
    return { tone: "alert", message: routeMessages.sessionEnded, values, revision };
  }
  await requireRole("teacher");
  const target = saveLessonTargetSchema.safeParse({
    lessonId: formData.get("lessonId"),
    revision: formData.get("revision"),
  });
  if (!target.success) return { tone: "alert", message: routeMessages.saveConflict, values };

  const { lessonId, revision } = target.data;
  const content = saveLessonContentSchema.safeParse(values);
  if (!content.success) {
    return {
      tone: "alert",
      message: routeMessages.checkFields,
      fieldErrors: saveFieldErrors(content.error),
      values,
      revision,
    };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("lessons")
    .update({ title: content.data.title, body_md: content.data.body, est_minutes: content.data.minutes })
    .eq("id", lessonId)
    .eq("revision", revision)
    .select("revision, modules!inner(class_id)");
  if (error) return { tone: "alert", message: writeErrorMessage(error), values, revision };
  if (!data.length) return { tone: "alert", message: routeMessages.saveConflict, values, revision };

  revalidateRoutes(data[0].modules.class_id, lessonId);
  return { tone: "status", message: routeMessages.saved, values, revision: data[0].revision };
}
