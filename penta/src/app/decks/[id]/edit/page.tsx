import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";
import { publishDeck, saveDeck } from "@/app/decks/editor-actions";
import viewerStyles from "@/components/decks/viewer/viewer.module.css";
import { Editor } from "@/components/slides/editor/Editor";
import { requireRole } from "@/lib/auth";
import { isClassOwner } from "@/lib/classes";
import { deckHasViews, loadDeck, loadDeckContent } from "@/lib/decks";
import { parseDeckContent } from "@/lib/slides/schema";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Edit deck · PENTA" };

const deckIdSchema = z.uuid();

export default async function EditDeckPage({ params }: PageProps<"/decks/[id]/edit">) {
  const user = await requireRole("teacher");
  const deckId = deckIdSchema.safeParse((await params).id);
  if (!deckId.success) notFound();

  const supabase = await createClient();
  const deck = await loadDeck(supabase, deckId.data);
  if (!deck || deck.kind !== "native" || !(await isClassOwner(supabase, deck.classId, user.id))) notFound();

  const [stored, viewed] = await Promise.all([loadDeckContent(supabase, deck.id), deckHasViews(supabase, deck.id)]);
  const content = stored ? parseDeckContent(stored.content) : null;
  if (!stored || !content) {
    return (
      <div className={viewerStyles.page}>
        <div className={viewerStyles.inner}>
          <p className={viewerStyles.notice}>This deck cannot be opened in the editor.</p>
        </div>
      </div>
    );
  }

  return (
    <Editor
      deck={{ id: deck.id, title: deck.title, classId: deck.classId, published: deck.ready, viewed }}
      initialContent={content}
      initialVersion={stored.version}
      save={saveDeck}
      publish={publishDeck}
    />
  );
}
