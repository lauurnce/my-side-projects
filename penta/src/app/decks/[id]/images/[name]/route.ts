import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { loadDeck } from "@/lib/decks";
import { readSlideImage } from "@/lib/slide-images";
import { imageMimeByKind, type ImageKind } from "@/lib/slides/image-file";
import { imageFilePattern } from "@/lib/slides/schema";
import { createClient } from "@/lib/supabase/server";

const deckIdSchema = z.uuid();

function notFound(): NextResponse {
  return new NextResponse("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });
}

export async function GET(_request: Request, { params }: RouteContext<"/decks/[id]/images/[name]">) {
  const { id, name } = await params;
  const deckId = deckIdSchema.safeParse(id);
  const user = await getCurrentUser();
  if (!user || !deckId.success || !imageFilePattern.test(name)) return notFound();

  const deck = await loadDeck(await createClient(), deckId.data);
  if (!deck || deck.kind !== "native") return notFound();

  const image = await readSlideImage(deck, name);
  if (!image) return notFound();

  return new NextResponse(image, {
    headers: {
      "Content-Type": imageMimeByKind[name.split(".").pop() as ImageKind],
      "Content-Disposition": "inline",
      "Content-Security-Policy": "default-src 'none'; sandbox",
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, max-age=300",
    },
  });
}
