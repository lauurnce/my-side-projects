import { slideLimits } from "@/lib/config";

export type SentImage = { file: string } | { message: string };

const extensionByType: Record<string, string> = { "image/webp": "webp", "image/png": "png", "image/jpeg": "jpg" };

export function fittedSize(width: number, height: number, longest: number = slideLimits.imageSendSide): { width: number; height: number } {
  const scale = Math.min(1, longest / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

async function redrawn(file: File): Promise<File> {
  const bitmap = await createImageBitmap(file);
  const size = fittedSize(bitmap.width, bitmap.height);
  const canvas = document.createElement("canvas");
  canvas.width = size.width;
  canvas.height = size.height;
  canvas.getContext("2d")?.drawImage(bitmap, 0, 0, size.width, size.height);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", 0.9));
  const extension = blob ? extensionByType[blob.type] : undefined;
  return blob && extension ? new File([blob], `image.${extension}`, { type: blob.type }) : file;
}

export async function sendSlideImage(deckId: string, chosen: File): Promise<SentImage> {
  const file = await redrawn(chosen).catch(() => chosen);
  const body = new FormData();
  body.set("file", file);
  const response = await fetch(`/decks/${deckId}/images`, { method: "POST", body }).catch(() => null);
  const answer: unknown = await response?.json().catch(() => null);
  const { file: stored, message } = (answer ?? {}) as { file?: unknown; message?: unknown };
  if (response?.ok && typeof stored === "string") return { file: stored };
  return { message: typeof message === "string" ? message : "The image could not be added. Try again." };
}
