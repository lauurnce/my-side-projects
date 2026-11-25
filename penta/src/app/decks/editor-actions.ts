"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUser, requireRole } from "@/lib/auth";
import { slideLimits } from "@/lib/config";
import { pruneSlideImages } from "@/lib/slide-images";
import type { SaveAnswer } from "@/lib/slides/autosave";
import { newId } from "@/lib/slides/ids";
import { layoutBlocks } from "@/lib/slides/layouts";
import { contentBytes, parseDeckContent, type DeckContent } from "@/lib/slides/schema";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  createDeckSchema,
  createRefusedMessage,
  createdDeckId,
  deckIdSchema,
  editorMessages,
  saveDeckSchema,
  toSaveAnswer,
  type EditorActionState,
} from "./editor-schema";

function firstContent(): DeckContent {
  return { v: 1, slides: [{ id: newId(), blocks: layoutBlocks("title", newId) }] };
}

export async function createNativeDeck(_previous: EditorActionState, formData: FormData): Promise<EditorActionState> {
  const user = await requireRole("teacher");
  const parsed = createDeckSchema.safeParse({
    classId: formData.get("classId"),
    title: formData.get("title"),
    lessonId: formData.get("lessonId") ?? "",
  });
  if (!parsed.success) return { tone: "alert", message: parsed.error.issues[0]?.message ?? editorMessages.badInput };

  const { data, error } = await createAdminClient().rpc("create_native_deck", {
    editor: user.id,
    target_class: parsed.data.classId,
    deck_title: parsed.data.title,
    target_lesson: parsed.data.lessonId as string,
    content: firstContent(),
  });
  const deckId = error ? null : createdDeckId(data);
  if (!deckId) return { tone: "alert", message: error ? editorMessages.failed : createRefusedMessage(data) };

  revalidatePath(`/classes/${parsed.data.classId}`);
  redirect(`/decks/${deckId}/edit`);
}

export async function saveDeck(input: unknown): Promise<SaveAnswer> {
  const user = await getCurrentUser();
  if (!user) return { status: "signed_out" };
  const parsed = saveDeckSchema.safeParse(input);
  if (user.role !== "teacher" || !parsed.success) return { status: "refused" };

  const content = parseDeckContent(parsed.data.content);
  if (!content) return { status: "refused" };
  if (contentBytes(content) > slideLimits.contentMaxBytes) return { status: "too_large" };

  const { data, error } = await createAdminClient().rpc("save_deck_content", {
    editor: user.id,
    target_deck: parsed.data.deckId,
    known_version: parsed.data.knownVersion,
    save_id: parsed.data.saveId,
    content,
  });
  if (error) return { status: "failed" };

  const answer = toSaveAnswer(data);
  if (answer.status === "saved") await pruneSlideImages(parsed.data.deckId).catch(() => undefined);
  return answer;
}

export async function publishDeck(input: unknown): Promise<EditorActionState> {
  const user = await getCurrentUser();
  const parsed = deckIdSchema.safeParse(input);
  if (!user || user.role !== "teacher" || !parsed.success) return { tone: "alert", message: editorMessages.gone };

  const admin = createAdminClient();
  const { data, error } = await admin.rpc("publish_native_deck", { editor: user.id, target_deck: parsed.data.deckId });
  if (error) return { tone: "alert", message: editorMessages.failed };
  if (data !== "published") return { tone: "alert", message: editorMessages.gone };

  const { data: deck } = await admin.from("decks").select("class_id").eq("id", parsed.data.deckId).maybeSingle();
  if (deck) revalidatePath(`/classes/${deck.class_id}`);
  revalidatePath(`/decks/${parsed.data.deckId}`);
  return { tone: "status", message: editorMessages.published };
}
