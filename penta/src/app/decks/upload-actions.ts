"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { isClassOwner } from "@/lib/classes";
import { loadDeck, type DeckDetail } from "@/lib/decks";
import { inspectDeckFiles, removeDeckFiles, signDeckUploads, sweepDecks, type DeckPaths } from "@/lib/deck-storage";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import {
  chosenFilesMessage,
  completionStep,
  deckIntentSchema,
  deckMessages,
  deckTargetSchema,
  finishDeckUploadSchema,
  finishInputMessage,
  inspectionStep,
  lessonLinkErrorMessage,
  reserveErrorMessage,
  reserveMessage,
  setDeckLessonSchema,
  startDeckUploadSchema,
  startInputMessage,
  toReserveResult,
  uploadFailure,
  type DeckActionState,
  type DeckIntent,
  type FinishStep,
  type StartUploadResult,
  type UploadStepResult,
} from "./upload-schema";

type Supabase = Awaited<ReturnType<typeof createClient>>;

const uploadDone: UploadStepResult = { status: "ok" };

function alertState(message: string): DeckActionState {
  return { tone: "alert", message };
}

function statusState(message: string): DeckActionState {
  return { tone: "status", message };
}

function revalidateDecks(classId: string, deckId?: string) {
  revalidatePath(`/classes/${classId}`);
  if (deckId) revalidatePath(`/decks/${deckId}`);
  revalidatePath("/classes");
  revalidatePath("/hub");
}

async function loadOwnedDeck(supabase: Supabase, deckId: string, userId: string): Promise<DeckDetail | null> {
  const deck = await loadDeck(supabase, deckId);
  if (!deck) return null;
  return (await isClassOwner(supabase, deck.classId, userId)) ? deck : null;
}

async function removeUnfinishedDeck(deckId: string, paths: DeckPaths | null): Promise<void> {
  const { data } = await createAdminClient().from("decks").delete().eq("id", deckId).is("ready_at", null).select("id");
  if (data?.length && paths) await removeDeckFiles(paths);
}

export async function startDeckUpload(input: unknown): Promise<StartUploadResult> {
  await requireRole("teacher");
  const parsed = startDeckUploadSchema.safeParse(input);
  if (!parsed.success) return uploadFailure(startInputMessage(parsed.error));

  const { classId, title, lessonId, pdf, pptx } = parsed.data;
  const fileMessage = chosenFilesMessage(pdf, pptx);
  if (fileMessage) return uploadFailure(fileMessage);

  await sweepDecks();
  const supabase = await createClient();
  const declaredBytes = pdf.size + (pptx?.size ?? 0);
  const { data, error } = await supabase.rpc("reserve_deck", {
    target_class: classId,
    deck_title: title,
    deck_kind: pptx ? "native" : "pdf",
    target_lesson: lessonId as string,
    declared_bytes: declaredBytes,
  });
  if (error) return uploadFailure(reserveErrorMessage(error));

  const reserved = toReserveResult(data);
  if (reserved.status !== "reserved" || !reserved.deckId) return uploadFailure(reserveMessage(reserved, declaredBytes));

  const deck = await loadDeck(supabase, reserved.deckId);
  const targets = deck ? await signDeckUploads(deck) : null;
  if (!targets) {
    await removeUnfinishedDeck(reserved.deckId, deck);
    return uploadFailure(deckMessages.storageUnavailable);
  }

  revalidateDecks(classId);
  return { status: "ok", deckId: reserved.deckId, targets };
}

async function applyFinishStep(supabase: Supabase, deck: DeckDetail, step: FinishStep): Promise<UploadStepResult> {
  if (step.step === "keep") return uploadFailure(step.message);
  if (step.step === "remove") {
    await removeUnfinishedDeck(deck.id, deck);
    revalidateDecks(deck.classId, deck.id);
    return uploadFailure(step.message);
  }
  if (step.step === "recheck") {
    const current = await loadDeck(supabase, deck.id);
    if (!current?.ready) return uploadFailure(deckMessages.gone);
  }
  revalidateDecks(deck.classId, deck.id);
  return uploadDone;
}

async function finishOwnedDeck(supabase: Supabase, deck: DeckDetail, slideCount: number): Promise<UploadStepResult> {
  if (deck.ready) return uploadDone;

  const inspection = await inspectDeckFiles(deck);
  if (inspection.status !== "ok") return applyFinishStep(supabase, deck, inspectionStep(inspection));

  const { data: status, error } = await createAdminClient().rpc("complete_deck", {
    target_deck: deck.id,
    real_bytes: inspection.bytes,
    slides: slideCount,
  });
  if (error) return uploadFailure(deckMessages.failed);
  return applyFinishStep(supabase, deck, completionStep(status));
}

export async function finishDeckUpload(input: unknown): Promise<UploadStepResult> {
  const user = await requireRole("teacher");
  const parsed = finishDeckUploadSchema.safeParse(input);
  if (!parsed.success) return uploadFailure(finishInputMessage(parsed.error));

  const supabase = await createClient();
  const deck = await loadOwnedDeck(supabase, parsed.data.deckId, user.id);
  if (!deck) return uploadFailure(deckMessages.gone);

  const result = await finishOwnedDeck(supabase, deck, parsed.data.slideCount);
  await sweepDecks();
  return result;
}

export async function cancelDeckUpload(input: unknown): Promise<UploadStepResult> {
  const user = await requireRole("teacher");
  const parsed = deckTargetSchema.safeParse(input);
  if (!parsed.success) return uploadFailure(deckMessages.gone);

  const supabase = await createClient();
  const deck = await loadOwnedDeck(supabase, parsed.data.deckId, user.id);
  if (!deck) return uploadFailure(deckMessages.gone);

  if (!deck.ready) await removeUnfinishedDeck(deck.id, deck);
  await sweepDecks();
  revalidateDecks(deck.classId, deck.id);
  return uploadDone;
}

export async function deleteDeck(formData: FormData): Promise<DeckActionState> {
  const user = await requireRole("teacher");
  const parsed = deckTargetSchema.safeParse({ deckId: formData.get("deckId") });
  if (!parsed.success) return alertState(deckMessages.gone);

  const supabase = await createClient();
  const deck = await loadOwnedDeck(supabase, parsed.data.deckId, user.id);
  if (!deck) return alertState(deckMessages.gone);

  const { data, error } = await createAdminClient().from("decks").delete().eq("id", deck.id).select("id");
  if (error) return alertState(deckMessages.failed);
  if (!data.length) return alertState(deckMessages.gone);

  await removeDeckFiles(deck);
  await sweepDecks();
  revalidateDecks(deck.classId, deck.id);
  return statusState(deckMessages.deleted);
}

export async function setDeckLesson(formData: FormData): Promise<DeckActionState> {
  await requireRole("teacher");
  const parsed = setDeckLessonSchema.safeParse({
    deckId: formData.get("deckId"),
    lessonId: formData.get("lessonId"),
  });
  if (!parsed.success) return alertState(deckMessages.gone);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("decks")
    .update({ lesson_id: parsed.data.lessonId })
    .eq("id", parsed.data.deckId)
    .select("id, class_id");
  if (error || !data?.length) return alertState(lessonLinkErrorMessage(error));

  revalidateDecks(data[0].class_id, data[0].id);
  return statusState(parsed.data.lessonId ? deckMessages.linkSaved : deckMessages.linkRemoved);
}

const deckActions: Record<DeckIntent, (formData: FormData) => Promise<DeckActionState>> = {
  deleteDeck,
  setDeckLesson,
};

export async function runDeckAction(_previousState: DeckActionState, formData: FormData): Promise<DeckActionState> {
  await requireRole("teacher");
  const intent = deckIntentSchema.safeParse(formData.get("intent"));
  if (!intent.success) return alertState(deckMessages.failed);
  return deckActions[intent.data](formData);
}
