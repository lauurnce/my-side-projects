import type { Slide } from "./schema";

const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789";

export type MakeId = () => string;

export function newId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("");
}

export function copySlide(slide: Slide, makeId: MakeId = newId): Slide {
  return { id: makeId(), blocks: slide.blocks.map((block) => ({ ...block, id: makeId() })) };
}
