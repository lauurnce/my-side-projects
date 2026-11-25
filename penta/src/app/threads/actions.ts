"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { loadThreadView, threadTargetHref } from "@/lib/threads";
import {
  addPostSchema,
  addPostState,
  askQuestionSchema,
  askRefusedState,
  askedThreadId,
  editPostSchema,
  editPostState,
  idOf,
  invalidState,
  sessionEndedState,
  textOf,
  unixLines,
  type ThreadFormState,
} from "./schema";

type Supabase = Awaited<ReturnType<typeof createClient>>;

async function revalidateThread(supabase: Supabase, threadId: string) {
  revalidatePath(`/threads/${threadId}`);
  const view = await loadThreadView(supabase, threadId);
  if (view?.status !== "ok") return;
  revalidatePath(threadTargetHref(view.thread));
  revalidatePath(`/classes/${view.thread.classId}`);
}

export async function askQuestion(_previousState: ThreadFormState, formData: FormData): Promise<ThreadFormState> {
  const values = { title: textOf(formData, "title"), body: unixLines(textOf(formData, "body")) };
  if (!(await getCurrentUser())) return sessionEndedState(values);
  const parsed = askQuestionSchema.safeParse({
    ...values,
    classId: formData.get("classId"),
    lessonId: idOf(formData, "lessonId"),
    activityId: idOf(formData, "activityId"),
  });
  if (!parsed.success) return invalidState(parsed.error, values);

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("ask_question", {
    target_lesson: parsed.data.lessonId as string,
    target_activity: parsed.data.activityId as string,
    question_title: parsed.data.title,
    question_body: parsed.data.body,
  });
  const threadId = error ? null : askedThreadId(data);
  if (!threadId) return askRefusedState(error ? null : data, values);

  await revalidateThread(supabase, threadId);
  redirect(`/threads/${threadId}`);
}

export async function addPost(_previousState: ThreadFormState, formData: FormData): Promise<ThreadFormState> {
  const values = { body: unixLines(textOf(formData, "body")) };
  if (!(await getCurrentUser())) return sessionEndedState(values);
  const parsed = addPostSchema.safeParse({
    ...values,
    threadId: formData.get("threadId"),
    parentId: idOf(formData, "parentId"),
  });
  if (!parsed.success) return invalidState(parsed.error, values);

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("add_post", {
    target_thread: parsed.data.threadId,
    target_parent: parsed.data.parentId as string,
    post_body: parsed.data.body,
  });
  const state = addPostState(error ? null : data, values);
  if (state.tone === "status") await revalidateThread(supabase, parsed.data.threadId);
  return state;
}

export async function editPost(_previousState: ThreadFormState, formData: FormData): Promise<ThreadFormState> {
  const values = { body: unixLines(textOf(formData, "body")) };
  if (!(await getCurrentUser())) return sessionEndedState(values);
  const parsed = editPostSchema.safeParse({ ...values, postId: formData.get("postId") });
  if (!parsed.success) return invalidState(parsed.error, values);

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("edit_post", {
    target_post: parsed.data.postId,
    post_body: parsed.data.body,
  });
  const state = editPostState(error ? null : data, values);
  if (state.tone === "status") revalidatePath("/threads/[id]", "page");
  return state;
}
