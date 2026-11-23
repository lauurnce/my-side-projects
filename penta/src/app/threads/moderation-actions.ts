"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import {
  failedState,
  moderationMessages,
  postHiddenState,
  postIdSchema,
  setPostHiddenSchema,
  setThreadLockedSchema,
  threadLockedState,
  toHistoryEvents,
  type HistoryEvent,
  type ModerationState,
} from "./moderation-schema";

function revalidateThread(threadId: string | null) {
  if (threadId) revalidatePath(`/threads/${threadId}`);
  revalidatePath("/classes/[id]", "layout");
}

export async function setPostHidden(_previous: ModerationState, formData: FormData): Promise<ModerationState> {
  await requireRole("teacher");
  const parsed = setPostHiddenSchema.safeParse({
    postId: formData.get("postId"),
    hide: formData.get("hide"),
    threadId: formData.get("threadId"),
  });
  if (!parsed.success) return { tone: "alert", message: moderationMessages.postNotFound };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("set_post_hidden", {
    target_post: parsed.data.postId,
    hide: parsed.data.hide,
  });
  if (error) return failedState();

  const state = postHiddenState(data);
  if (state.tone === "status") revalidateThread(parsed.data.threadId);
  return state;
}

export async function setThreadLocked(_previous: ModerationState, formData: FormData): Promise<ModerationState> {
  await requireRole("teacher");
  const parsed = setThreadLockedSchema.safeParse({ threadId: formData.get("threadId"), lock: formData.get("lock") });
  if (!parsed.success) return { tone: "alert", message: moderationMessages.threadNotFound };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("set_thread_locked", {
    target_thread: parsed.data.threadId,
    lock: parsed.data.lock,
  });
  if (error) return failedState();

  const state = threadLockedState(data);
  if (state.tone === "status") revalidateThread(parsed.data.threadId);
  return state;
}

export async function loadPostHistory(postId: string): Promise<HistoryEvent[]> {
  await requireRole("teacher");
  const parsed = postIdSchema.safeParse(postId);
  if (!parsed.success) return [];

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("post_history", { target_post: parsed.data });
  if (error || !Array.isArray(data)) return [];
  return toHistoryEvents(data);
}
