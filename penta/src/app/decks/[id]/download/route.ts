import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { downloadFileName, isUploadedDeck, loadDeck } from "@/lib/decks";
import { signDeckDownload } from "@/lib/deck-storage";
import { createClient } from "@/lib/supabase/server";

const deckIdSchema = z.uuid();
const noStore = { "Cache-Control": "no-store" };

function notFound(): NextResponse {
  return new NextResponse("Not found", { status: 404, headers: noStore });
}

export async function GET(_request: Request, { params }: RouteContext<"/decks/[id]/download">) {
  const user = await getCurrentUser();
  const deckId = deckIdSchema.safeParse((await params).id);
  if (!user || !deckId.success) return notFound();

  const deck = await loadDeck(await createClient(), deckId.data);
  if (!deck || !deck.ready || !isUploadedDeck(deck)) return notFound();

  const url = await signDeckDownload(deck.originalPath ?? deck.pdfPath, downloadFileName(deck.title, deck.kind));
  if (!url) return new NextResponse("The file is not available right now. Try again.", { status: 503, headers: noStore });
  return NextResponse.redirect(url, { status: 302, headers: noStore });
}
