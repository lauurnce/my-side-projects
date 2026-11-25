import "server-only";
import { randomUUID } from "node:crypto";
import { imageMimeByKind, type ImageKind } from "@/lib/slides/image-file";
import { createAdminClient } from "@/lib/supabase/admin";

type DeckFolder = { id: string; classId: string };

export type ImageRoom = "ok" | "not_found" | "image_limit" | "full" | "unavailable";

const bucket = "decks";
const rooms: readonly string[] = ["ok", "not_found", "image_limit", "full"];

function imagePath(deck: DeckFolder, file: string): string {
  return `${deck.classId}/${deck.id}/images/${file}`;
}

export async function pruneSlideImages(deckId: string): Promise<void> {
  const admin = createAdminClient();
  const { data } = await admin.rpc("unused_deck_images", { target_deck: deckId });
  if (data?.length) await admin.storage.from(bucket).remove(data);
}

async function askRoom(editorId: string, deckId: string, bytes: number): Promise<ImageRoom> {
  const { data } = await createAdminClient().rpc("deck_image_room", { editor: editorId, target_deck: deckId, image_bytes: bytes });
  return typeof data === "string" && rooms.includes(data) ? (data as ImageRoom) : "unavailable";
}

export async function slideImageRoom(editorId: string, deckId: string, bytes: number): Promise<ImageRoom> {
  const room = await askRoom(editorId, deckId, bytes);
  if (room !== "image_limit") return room;
  await pruneSlideImages(deckId);
  return askRoom(editorId, deckId, bytes);
}

export async function storeSlideImage(deck: DeckFolder, kind: ImageKind, bytes: Uint8Array): Promise<string | null> {
  const file = `${randomUUID()}.${kind}`;
  const { error } = await createAdminClient()
    .storage.from(bucket)
    .upload(imagePath(deck, file), bytes, { contentType: imageMimeByKind[kind], upsert: false });
  return error ? null : file;
}

export async function readSlideImage(deck: DeckFolder, file: string): Promise<Blob | null> {
  const { data } = await createAdminClient().storage.from(bucket).download(imagePath(deck, file));
  return data ?? null;
}
