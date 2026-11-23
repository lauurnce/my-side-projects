import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";
import { DeckViewer } from "@/components/decks/DeckViewer";
import { requireUser } from "@/lib/auth";
import { isClassOwner } from "@/lib/classes";
import { isUploadedDeck, loadDeck, loadViewedSlides } from "@/lib/decks";
import { deckFileSize, signDeckView } from "@/lib/deck-storage";
import { loadLiveState } from "@/lib/live";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Deck · PENTA" };

const deckIdSchema = z.uuid();

export default async function DeckPage({ params }: PageProps<"/decks/[id]">) {
  const user = await requireUser();
  const deckId = deckIdSchema.safeParse((await params).id);
  if (!deckId.success) notFound();

  const supabase = await createClient();
  const deck = await loadDeck(supabase, deckId.data);
  if (!deck || !deck.ready || !isUploadedDeck(deck)) notFound();

  const isStudent = user.role === "student";
  const [url, length, viewedSlides, isOwner, initialLive] = await Promise.all([
    signDeckView(deck.pdfPath),
    deckFileSize(deck.pdfPath),
    isStudent ? loadViewedSlides(supabase, deck.id, user.id) : [],
    isClassOwner(supabase, deck.classId, user.id),
    loadLiveState(supabase, deck.id),
  ]);

  return (
    <DeckViewer
      deck={deck}
      source={url && length ? { url, length } : null}
      viewedSlides={viewedSlides}
      recordsViews={isStudent}
      viewer={{ id: user.id, isOwner }}
      initialLive={initialLive}
    />
  );
}
