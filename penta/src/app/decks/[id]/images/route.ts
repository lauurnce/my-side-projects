import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { isClassOwner } from "@/lib/classes";
import { slideLimits } from "@/lib/config";
import { loadDeck } from "@/lib/decks";
import { slideImageRoom, storeSlideImage, type ImageRoom } from "@/lib/slide-images";
import { imageProblemMessages, inspectImage } from "@/lib/slides/image-file";
import { createClient } from "@/lib/supabase/server";

const deckIdSchema = z.uuid();
const noStore = { "Cache-Control": "no-store" };
const formOverheadBytes = 64 * 1024;

const roomMessages: Record<Exclude<ImageRoom, "ok">, string> = {
  not_found: "That deck is no longer here.",
  image_limit: `A deck can hold ${slideLimits.imagesPerDeck} images. Unused images are cleared after a day.`,
  full: "Storage is full. Delete decks you no longer need.",
  unavailable: "Storage is not available right now. Try again in a moment.",
};

function refuse(status: number, message: string): NextResponse {
  return NextResponse.json({ message }, { status, headers: noStore });
}

function sameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  return origin === null || origin === new URL(request.url).origin;
}

async function chosenFile(request: Request): Promise<File | null> {
  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  return file && typeof file !== "string" ? file : null;
}

export async function POST(request: Request, { params }: RouteContext<"/decks/[id]/images">) {
  const user = await getCurrentUser();
  const deckId = deckIdSchema.safeParse((await params).id);
  if (!user || user.role !== "teacher" || !deckId.success || !sameOrigin(request)) {
    return refuse(404, roomMessages.not_found);
  }
  if (Number(request.headers.get("content-length") ?? 0) > slideLimits.imageMaxBytes + formOverheadBytes) {
    return refuse(413, imageProblemMessages.too_large);
  }

  const supabase = await createClient();
  const deck = await loadDeck(supabase, deckId.data);
  if (!deck || deck.kind !== "native" || !(await isClassOwner(supabase, deck.classId, user.id))) {
    return refuse(404, roomMessages.not_found);
  }

  const file = await chosenFile(request);
  if (!file) return refuse(400, imageProblemMessages.not_image);
  const bytes = new Uint8Array(await file.arrayBuffer());
  const image = inspectImage(file, bytes);
  if (typeof image === "string") return refuse(400, imageProblemMessages[image]);

  const room = await slideImageRoom(user.id, deck.id, bytes.length);
  if (room !== "ok") return refuse(room === "not_found" ? 404 : 409, roomMessages[room]);

  const stored = await storeSlideImage(deck, image.kind, bytes);
  if (!stored) return refuse(503, roomMessages.unavailable);
  return NextResponse.json({ file: stored }, { status: 201, headers: noStore });
}
