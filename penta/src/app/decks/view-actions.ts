"use server";

import { z } from "zod";
import type { DeckSource } from "@/components/decks/DeckViewer";
import { requireUser } from "@/lib/auth";
import { deckFileSize, signDeckView } from "@/lib/deck-storage";
import { loadDeck } from "@/lib/decks";
import { createClient } from "@/lib/supabase/server";

const deckTargetSchema = z.object({ deckId: z.uuid() });

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
