"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { loadActivity } from "@/lib/quiz";
import { createClient } from "@/lib/supabase/server";
import {
  activityTargetSchema,
  badKeyMessage,
  buildQuestion,
  builderIntentSchema,
  createQuizSchema,
  deleteQuestionState,
  keyFromForm,
  moveQuestionSchema,
  moveQuestionState,
  questionFromForm,
  questionTargetSchema,
  quizMessages,
  quizSettingsSchema,
  quizWriteErrorMessage,
  rekeyState,
  rekeyTargetSchema,
  rekeyValue,
  saveQuestionState,
  saveQuestionTargetSchema,
  setQuizPublishedSchema,
  settingsErrorState,
  settingsFieldErrors,
  settingsFromForm,
  titleErrorMessage,
  type BuilderIntent,
  type QuizActionState,
  type SaveQuestionState,
  type SaveSettingsState,
} from "./builder-schema";

type Supabase = Awaited<ReturnType<typeof createClient>>;

type QuestionHome = { activityId: string; classId: string };

function alertState(message: string): QuizActionState {
  return { tone: "alert", message };
}

function statusState(message: string): QuizActionState {
  return { tone: "status", message };
}

function revalidateQuiz(classId: string, activityId?: string) {
  revalidatePath(`/classes/${classId}`);
  if (activityId) {
    revalidatePath(`/ops/${activityId}`);
    revalidatePath(`/ops/${activityId}/results`);
    revalidatePath("/ops/[id]/attempt/[attemptId]", "page");
  }
  revalidatePath("/classes");
  revalidatePath("/hub");
}

async function findQuestionHome(supabase: Supabase, questionId: string): Promise<QuestionHome | null> {
  const { data } = await supabase
    .from("quiz_questions")
    .select("activity_id, activities!inner(class_id)")
    .eq("id", questionId)
    .maybeSingle();
  return data ? { activityId: data.activity_id, classId: data.activities.class_id } : null;
}

export async function createQuiz(formData: FormData): Promise<QuizActionState> {
  await requireRole("teacher");
  const parsed = createQuizSchema.safeParse({ classId: formData.get("classId"), title: formData.get("title") });
  if (!parsed.success) return alertState(titleErrorMessage(parsed.error));

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("activities")
    .insert({ class_id: parsed.data.classId, title: parsed.data.title })
    .select("id, class_id");
  if (error || !data?.length) return alertState(error ? quizWriteErrorMessage(error) : quizMessages.refused);

  revalidateQuiz(data[0].class_id, data[0].id);
  redirect(`/ops/${data[0].id}`);
}

export async function saveQuizSettings(
  _previousState: SaveSettingsState,
  formData: FormData,
): Promise<SaveSettingsState> {
  await requireRole("teacher");
  const values = settingsFromForm(formData);
  const target = activityTargetSchema.safeParse({ activityId: formData.get("activityId") });
  if (!target.success) return { tone: "alert", message: quizMessages.gone, values };

  const settings = quizSettingsSchema.safeParse(values);
  if (!settings.success) {
    return {
      tone: "alert",
      message: quizMessages.checkFields,
      fieldErrors: settingsFieldErrors(settings.error),
      values,
    };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("activities")
    .update({
      title: settings.data.title,
      instructions_md: settings.data.instructions,
      due_at: settings.data.dueAt,
      attempt_limit: settings.data.attemptLimit,
      time_limit_min: settings.data.timeLimit,
      show_answers: settings.data.showAnswers,
      requires_deck_id: settings.data.deckId,
      lesson_id: settings.data.lessonId,
    })
    .eq("id", target.data.activityId)
    .select("class_id");
  if (error || !data?.length) return { ...settingsErrorState(error), values };

  revalidateQuiz(data[0].class_id, target.data.activityId);
  return { tone: "status", message: quizMessages.settingsSaved };
}

export async function saveQuestion(_previousState: SaveQuestionState, formData: FormData): Promise<SaveQuestionState> {
  await requireRole("teacher");
  const values = questionFromForm(formData);
  const target = saveQuestionTargetSchema.safeParse({
    activityId: formData.get("activityId"),
    questionId: formData.get("questionId") ?? "",
  });
  if (!target.success) return { tone: "alert", message: quizMessages.gone, values };

  const built = buildQuestion(values);
  if (!built.ok) return { tone: "alert", message: built.message, fieldErrors: built.fieldErrors, values };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("save_quiz_question", {
    target_activity: target.data.activityId,
    target_question: target.data.questionId as string,
    ...built.args,
  });
  if (error) return { tone: "alert", message: quizMessages.failed, values };

  const state = saveQuestionState(data, built.args.question_kind);
  if (state.tone !== "status") return { ...state, values };

  const activity = await loadActivity(supabase, target.data.activityId);
  if (activity) revalidateQuiz(activity.classId, activity.id);
  return state;
}

export async function deleteQuestion(formData: FormData): Promise<QuizActionState> {
  await requireRole("teacher");
  const parsed = questionTargetSchema.safeParse({ questionId: formData.get("questionId") });
  if (!parsed.success) return alertState(quizMessages.questionGone);

  const supabase = await createClient();
  const home = await findQuestionHome(supabase, parsed.data.questionId);
  if (!home) return alertState(quizMessages.questionGone);

  const { data, error } = await supabase.rpc("delete_quiz_question", { target_question: parsed.data.questionId });
  if (error) return alertState(quizMessages.failed);

  const state = deleteQuestionState(data);
  if (state.tone === "status") revalidateQuiz(home.classId, home.activityId);
  return state;
}

export async function moveQuestion(formData: FormData): Promise<QuizActionState> {
  await requireRole("teacher");
  const parsed = moveQuestionSchema.safeParse({
    questionId: formData.get("questionId"),
    step: formData.get("direction"),
  });
  if (!parsed.success) return alertState(quizMessages.questionGone);

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("move_quiz_question", {
    target_question: parsed.data.questionId,
    step: parsed.data.step,
  });
  if (error) return alertState(quizMessages.failed);

  const state = moveQuestionState(data);
  if (state.tone !== "status") return state;

  const home = await findQuestionHome(supabase, parsed.data.questionId);
  if (home) revalidateQuiz(home.classId, home.activityId);
  return state;
}

export async function setQuizPublished(formData: FormData): Promise<QuizActionState> {
  await requireRole("teacher");
  const parsed = setQuizPublishedSchema.safeParse({
    activityId: formData.get("activityId"),
    published: formData.get("published"),
  });
  if (!parsed.success) return alertState(quizMessages.gone);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("activities")
    .update({ published_at: parsed.data.published ? new Date().toISOString() : null })
    .eq("id", parsed.data.activityId)
    .select("class_id");
  if (error || !data?.length) return alertState(quizWriteErrorMessage(error));

  revalidateQuiz(data[0].class_id, parsed.data.activityId);
  return statusState(parsed.data.published ? quizMessages.published : quizMessages.unpublished);
}

export async function closeQuizNow(formData: FormData): Promise<QuizActionState> {
  await requireRole("teacher");
  const parsed = activityTargetSchema.safeParse({ activityId: formData.get("activityId") });
  if (!parsed.success) return alertState(quizMessages.gone);

  const now = new Date().toISOString();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("activities")
    .update({ due_at: now })
    .eq("id", parsed.data.activityId)
    .not("published_at", "is", null)
    .or(`due_at.is.null,due_at.gt."${now}"`)
    .select("class_id");
  if (error) return alertState(quizWriteErrorMessage(error));
  if (!data.length) return alertState(quizMessages.notOpen);

  revalidateQuiz(data[0].class_id, parsed.data.activityId);
  return statusState(quizMessages.closed);
}

export async function deleteQuiz(formData: FormData): Promise<QuizActionState> {
  await requireRole("teacher");
  const parsed = activityTargetSchema.safeParse({ activityId: formData.get("activityId") });
  if (!parsed.success) return alertState(quizMessages.gone);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("activities")
    .delete()
    .eq("id", parsed.data.activityId)
    .select("class_id");
  if (error || !data?.length) return alertState(quizWriteErrorMessage(error));

  revalidateQuiz(data[0].class_id, parsed.data.activityId);
  redirect(`/classes/${data[0].class_id}`);
}

export async function rekeyQuestion(_previousState: QuizActionState, formData: FormData): Promise<QuizActionState> {
  await requireRole("teacher");
  const parsed = rekeyTargetSchema.safeParse({ questionId: formData.get("questionId"), kind: formData.get("kind") });
  if (!parsed.success) return alertState(quizMessages.questionGone);

  const { questionId, kind } = parsed.data;
  const key = rekeyValue(kind, keyFromForm(formData));
  if (key === null) return alertState(badKeyMessage(kind));

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("rekey_quiz_question", { target_question: questionId, key_answers: key });
  if (error) return alertState(quizMessages.failed);

  const state = rekeyState(data, kind);
  if (state.tone !== "status") return state;

  const home = await findQuestionHome(supabase, questionId);
  if (home) revalidateQuiz(home.classId, home.activityId);
  return state;
}

const builderActions: Record<BuilderIntent, (formData: FormData) => Promise<QuizActionState>> = {
  createQuiz,
  deleteQuestion,
  moveQuestion,
  setQuizPublished,
  closeQuizNow,
  deleteQuiz,
};

export async function runBuilderAction(_previousState: QuizActionState, formData: FormData): Promise<QuizActionState> {
  await requireRole("teacher");
  const intent = builderIntentSchema.safeParse(formData.get("intent"));
  if (!intent.success) return alertState(quizMessages.failed);
  return builderActions[intent.data](formData);
}
