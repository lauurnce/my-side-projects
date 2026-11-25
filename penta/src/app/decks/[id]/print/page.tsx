import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";
import { PrintDeck } from "@/components/slides/PrintDeck";
import { requireUser } from "@/lib/auth";
import { loadDeck, loadDeckContent } from "@/lib/decks";
import { parseDeckContent } from "@/lib/slides/schema";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Print deck · PENTA" };

const deckIdSchema = z.uuid();

export default async function PrintDeckPage({ params }: PageProps<"/decks/[id]/print">) {
  await requireUser();
  const deckId = deckIdSchema.safeParse((await params).id);
  if (!deckId.success) notFound();

  const supabase = await createClient();
  const deck = await loadDeck(supabase, deckId.data);
  if (!deck || deck.kind !== "native") notFound();

  const stored = await loadDeckContent(supabase, deck.id);
  const content = stored ? parseDeckContent(stored.content) : null;
  if (!content) notFound();

  return <PrintDeck deckId={deck.id} title={deck.title} content={content} />;
}
