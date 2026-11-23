"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { loadActivity } from "@/lib/quiz";
import { checkChosenSubmission, submissionKindOf, submissionMessages } from "@/lib/submission-file";
import {
  inspectSubmission,
  kindOfMime,
  removeSubmissionFile,
  signSubmissionUpload,
  sweepSubmissions,
} from "@/lib/submission-storage";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import {
  completionStep,
  handInFailure,
  handInMessages,
  inspectionStep,
  reserveStep,
  startHandInSchema,
  startInputMessage,
  uploadTargetSchema,
  type HandInStepResult,
  type StartHandInResult,
} from "./handin-schema";

type PendingUpload = { id: string; activityId: string; filePath: string; mime: string };
type PendingLookup = PendingUpload | "missing" | "unavailable";

const handInDone: HandInStepResult = { status: "ok" };

async function loadOwnPending(uploadId: string, studentId: string): Promise<PendingLookup> {
  const { data, error } = await createAdminClient()
    .from("submission_uploads")
    .select("id, student_id, activity_id, file_path, mime")
    .eq("id", uploadId)
    .eq("student_id", studentId)
    .maybeSingle();
  if (error) return "unavailable";
  if (!data) return "missing";
  return { id: data.id, activityId: data.activity_id, filePath: data.file_path, mime: data.mime };
}

async function cancelPending(uploadId: string): Promise<boolean> {
  const { data } = await createAdminClient().rpc("cancel_submission_upload", { target_upload: uploadId });
  return data === "cancelled";
}

async function revalidateHandIn(activityId: string): Promise<void> {
  const activity = await loadActivity(await createClient(), activityId);
  if (activity) {
    revalidatePath(`/classes/${activity.classId}`);
    revalidatePath(`/classes/${activity.classId}/grades`);
  }
  revalidatePath(`/ops/${activityId}`);
  revalidatePath("/grades");
  revalidatePath("/classes");
  revalidatePath("/hub");
}

export async function startHandIn(input: unknown): Promise<StartHandInResult> {
  const user = await requireRole("student");
  const parsed = startHandInSchema.safeParse(input);
  if (!parsed.success) return handInFailure(startInputMessage(parsed.error));

  const { activityId, file } = parsed.data;
  const problem = checkChosenSubmission(file);
  const kind = submissionKindOf(file.name);
  if (problem || !kind) return handInFailure(submissionMessages[problem ?? "wrong_extension"]);

  await sweepSubmissions();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("reserve_submission", {
    target_activity: activityId,
    file_name: file.name,
    file_kind: kind,
    declared_bytes: file.size,
  });
  if (error) return handInFailure(handInMessages.failed);

  const reserved = reserveStep(data);
  if (reserved.step === "stop") return handInFailure(reserved.message);

  const pending = await loadOwnPending(reserved.uploadId, user.id);
  const target = typeof pending === "string" ? null : await signSubmissionUpload(pending.filePath, pending.mime);
  if (!target) {
    await cancelPending(reserved.uploadId);
    return handInFailure(handInMessages.storageUnavailable);
  }
  return { status: "ok", uploadId: reserved.uploadId, target };
}

async function finishPending(pending: PendingUpload): Promise<HandInStepResult> {
  const kind = kindOfMime(pending.mime);
  if (!kind) return handInFailure(handInMessages.storageUnavailable);

  const inspected = inspectionStep(await inspectSubmission(pending.filePath, kind));
  if (inspected.step === "keep") return handInFailure(inspected.message);
  if (inspected.step === "remove") {
    if (await cancelPending(pending.id)) await removeSubmissionFile(pending.filePath);
    return handInFailure(inspected.message);
  }

  const { data, error } = await createAdminClient().rpc("complete_submission", {
    target_upload: pending.id,
    real_bytes: inspected.bytes,
    stored_etag: inspected.etag,
  });
  if (error) return handInFailure(handInMessages.failed);

  const completed = completionStep(data);
  if (completed.step === "keep") return handInFailure(completed.message);
  if (completed.step === "remove") {
    await removeSubmissionFile(completed.path);
    await revalidateHandIn(pending.activityId);
    return handInFailure(completed.message);
  }
  if (completed.oldPath !== pending.filePath) await removeSubmissionFile(completed.oldPath);
  await revalidateHandIn(pending.activityId);
  return handInDone;
}

export async function finishHandIn(input: unknown): Promise<HandInStepResult> {
  const user = await requireRole("student");
  const parsed = uploadTargetSchema.safeParse(input);
  if (!parsed.success) return handInFailure(handInMessages.replaced);

  const pending = await loadOwnPending(parsed.data.uploadId, user.id);
  if (pending === "unavailable") return handInFailure(handInMessages.storageUnavailable);
  if (pending === "missing") return handInFailure(handInMessages.replaced);

  const result = await finishPending(pending);
  await sweepSubmissions();
  return result;
}

export async function cancelHandIn(input: unknown): Promise<HandInStepResult> {
  const user = await requireRole("student");
  const parsed = uploadTargetSchema.safeParse(input);
  if (!parsed.success) return handInFailure(handInMessages.replaced);

  const pending = await loadOwnPending(parsed.data.uploadId, user.id);
  if (pending === "unavailable") return handInFailure(handInMessages.storageUnavailable);
  if (pending === "missing") return handInFailure(handInMessages.replaced);

  if (await cancelPending(pending.id)) await removeSubmissionFile(pending.filePath);
  await sweepSubmissions();
  return handInDone;
}
