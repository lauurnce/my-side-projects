"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { sweepSubmissions } from "@/lib/submission-storage";
import { createClient } from "@/lib/supabase/server";
import {
  badScoreMessage,
  createErrorMessage,
  createUploadSchema,
  feedbackFits,
  gradeFromForm,
  gradeState,
  gradeTargetSchema,
  parseScore,
  removedFilesMessage,
  setUploadPublishedSchema,
  uploadIntentSchema,
  uploadMessages,
  uploadSettingsErrorState,
  uploadSettingsFieldErrors,
  uploadSettingsFromForm,
  uploadSettingsSchema,
  uploadTargetSchema,
  uploadWriteErrorMessage,
  type GradeState,
  type SaveUploadSettingsState,
  type UploadActionState,
  type UploadIntent,
} from "./grading-schema";

type Supabase = Awaited<ReturnType<typeof createClient>>;

type SubmissionHome = { activityId: string; classId: string; points: number };

function alertState(message: string): UploadActionState {
  return { tone: "alert", message };
}

function statusState(message: string): UploadActionState {
  return { tone: "status", message };
}

function revalidateUpload(classId: string, activityId: string) {
  revalidatePath(`/classes/${classId}`);
  revalidatePath(`/ops/${activityId}`);
  revalidatePath(`/classes/${classId}/grades`);
  revalidatePath("/grades");
  revalidatePath("/classes");
  revalidatePath("/hub");
}

async function findSubmissionHome(supabase: Supabase, submissionId: string): Promise<SubmissionHome | null> {
  const { data } = await supabase
    .from("submissions")
    .select("activity_id, activities!inner(class_id, points)")
    .eq("id", submissionId)
    .maybeSingle();
  if (!data) return null;
  return { activityId: data.activity_id, classId: data.activities.class_id, points: data.activities.points };
}

async function findUploadClass(supabase: Supabase, activityId: string): Promise<string | null> {
  const { data } = await supabase
    .from("activities")
    .select("class_id")
    .eq("id", activityId)
    .eq("type", "upload")
    .maybeSingle();
  return data?.class_id ?? null;
}

export async function createUploadActivity(formData: FormData): Promise<UploadActionState> {
  await requireRole("teacher");
  const parsed = createUploadSchema.safeParse({
    classId: formData.get("classId"),
    title: formData.get("title"),
    points: formData.get("points"),
  });
  if (!parsed.success) return alertState(createErrorMessage(parsed.error));

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("activities")
    .insert({ class_id: parsed.data.classId, title: parsed.data.title, type: "upload", points: parsed.data.points })
    .select("id, class_id");
  if (error || !data?.length) return alertState(error ? uploadWriteErrorMessage(error) : uploadMessages.refused);

  revalidateUpload(data[0].class_id, data[0].id);
  redirect(`/ops/${data[0].id}`);
}

export async function saveUploadSettings(
  _previousState: SaveUploadSettingsState,
  formData: FormData,
): Promise<SaveUploadSettingsState> {
  await requireRole("teacher");
  const values = uploadSettingsFromForm(formData);
  const target = uploadTargetSchema.safeParse({ activityId: formData.get("activityId") });
  if (!target.success) return { tone: "alert", message: uploadMessages.gone, values };

  const settings = uploadSettingsSchema.safeParse(values);
  if (!settings.success) {
    return {
      tone: "alert",
      message: uploadMessages.checkFields,
      fieldErrors: uploadSettingsFieldErrors(settings.error),
      values,
    };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("activities")
    .update({
      title: settings.data.title,
      instructions_md: settings.data.instructions,
      points: settings.data.points,
      due_at: settings.data.dueAt,
      lesson_id: settings.data.lessonId,
    })
    .eq("id", target.data.activityId)
    .eq("type", "upload")
    .select("class_id");
  if (error || !data?.length) return { ...uploadSettingsErrorState(error), values };

  revalidateUpload(data[0].class_id, target.data.activityId);
  return { tone: "status", message: uploadMessages.settingsSaved };
}

export async function setUploadPublished(formData: FormData): Promise<UploadActionState> {
  await requireRole("teacher");
  const parsed = setUploadPublishedSchema.safeParse({
    activityId: formData.get("activityId"),
    published: formData.get("published"),
  });
  if (!parsed.success) return alertState(uploadMessages.gone);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("activities")
    .update({ published_at: parsed.data.published ? new Date().toISOString() : null })
    .eq("id", parsed.data.activityId)
    .eq("type", "upload")
    .select("class_id");
  if (error || !data?.length) return alertState(uploadWriteErrorMessage(error));

  revalidateUpload(data[0].class_id, parsed.data.activityId);
  return statusState(parsed.data.published ? uploadMessages.published : uploadMessages.unpublished);
}

export async function deleteUploadActivity(formData: FormData): Promise<UploadActionState> {
  await requireRole("teacher");
  const parsed = uploadTargetSchema.safeParse({ activityId: formData.get("activityId") });
  if (!parsed.success) return alertState(uploadMessages.gone);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("activities")
    .delete()
    .eq("id", parsed.data.activityId)
    .eq("type", "upload")
    .select("class_id");
  if (error || !data?.length) return alertState(uploadWriteErrorMessage(error));

  revalidateUpload(data[0].class_id, parsed.data.activityId);
  redirect(`/classes/${data[0].class_id}`);
}

export async function gradeSubmission(_previousState: GradeState, formData: FormData): Promise<GradeState> {
  await requireRole("teacher");
  const values = gradeFromForm(formData);
  const target = gradeTargetSchema.safeParse({
    submissionId: formData.get("submissionId"),
    expectedUpload: formData.get("expectedUpload"),
  });
  if (!target.success) return { tone: "alert", message: uploadMessages.submissionGone, values };

  const supabase = await createClient();
  const home = await findSubmissionHome(supabase, target.data.submissionId);
  if (!home) return { tone: "alert", message: uploadMessages.submissionGone, values };

  const score = parseScore(values.score);
  if (score === null) return { tone: "alert", message: badScoreMessage(home.points), field: "score", values };
  if (!feedbackFits(values.feedback)) {
    return { tone: "alert", message: uploadMessages.badFeedback, field: "feedback", values };
  }

  const { data, error } = await supabase.rpc("grade_submission", {
    target_submission: target.data.submissionId,
    expected_upload: target.data.expectedUpload,
    new_score: score,
    new_feedback: values.feedback,
  });
  if (error) return { tone: "alert", message: uploadMessages.failed, values };

  const state = gradeState(data, home.points);
  if (state.tone !== "status") return { ...state, values };

  revalidateUpload(home.classId, home.activityId);
  return state;
}

export async function removeGradedFiles(formData: FormData): Promise<UploadActionState> {
  await requireRole("teacher");
  const parsed = uploadTargetSchema.safeParse({ activityId: formData.get("activityId") });
  if (!parsed.success) return alertState(uploadMessages.gone);

  const supabase = await createClient();
  const classId = await findUploadClass(supabase, parsed.data.activityId);
  if (!classId) return alertState(uploadMessages.gone);

  const { data, error } = await supabase.rpc("drop_graded_files", { target_activity: parsed.data.activityId });
  if (error) return alertState(uploadMessages.failed);

  await sweepSubmissions();
  revalidateUpload(classId, parsed.data.activityId);
  return statusState(removedFilesMessage(data ?? 0));
}

const uploadActions: Record<UploadIntent, (formData: FormData) => Promise<UploadActionState>> = {
  createUploadActivity,
  setUploadPublished,
  deleteUploadActivity,
  removeGradedFiles,
};

export async function runUploadAction(
  _previousState: UploadActionState,
  formData: FormData,
): Promise<UploadActionState> {
  await requireRole("teacher");
  const intent = uploadIntentSchema.safeParse(formData.get("intent"));
  if (!intent.success) return alertState(uploadMessages.failed);
  return uploadActions[intent.data](formData);
}
