"use server";

import { z } from "zod";
import type { DeckSource } from "@/components/decks/DeckViewer";
import { requireUser } from "@/lib/auth";
import { deckLimits } from "@/lib/config";
import { deckFileSize, signDeckView } from "@/lib/deck-storage";
import { loadDeck } from "@/lib/decks";
import { createClient } from "@/lib/supabase/server";

const slideViewSchema = z.object({
  deckId: z.uuid(),
  slideNo: z.number().int().min(1).max(deckLimits.slidesMax),
});

const deckTargetSchema = z.object({ deckId: z.uuid() });

export async function recordSlideView(input: { deckId: string; slideNo: number }): Promise<{ ok: boolean }> {
  const user = await requireUser();
  const parsed = slideViewSchema.safeParse(input);
  if (!parsed.success || user.role !== "student") return { ok: false };

  const supabase = await createClient();
  const { error } = await supabase
    .from("deck_views")
    .upsert(
      { deck_id: parsed.data.deckId, student_id: user.id, slide_no: parsed.data.slideNo },
      { onConflict: "deck_id,student_id,slide_no", ignoreDuplicates: true },
    );
  return { ok: !error };
}

export async function refreshDeckSource(input: { deckId: string }): Promise<DeckSource | null> {
  await requireUser();
  const parsed = deckTargetSchema.safeParse(input);
  if (!parsed.success) return null;

  const supabase = await createClient();
  const deck = await loadDeck(supabase, parsed.data.deckId);
  if (!deck || !deck.ready) return null;

  const [url, length] = await Promise.all([signDeckView(deck.pdfPath), deckFileSize(deck.pdfPath)]);
  return url && length ? { url, length } : null;
}
