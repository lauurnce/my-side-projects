import { z } from "zod";
import { slideLimits } from "@/lib/config";

const controlCharacters = /[\u0000-\u0009\u000B-\u001F\u007F-\u009F]/;
const hiddenCharacters = /[\u00AD\u034F\u061C\u115F\u1160\u180E\u200B-\u200F\u2028-\u202E\u2060-\u206F\u2800\u3164\uFEFF\uFFA0\uFFF9-\uFFFB]/;
const stackedMarks = /[\u0300-\u036F\u0483-\u0489\u1AB0-\u1AFF\u1DC0-\u1DFF\u20D0-\u20FF\uFE20-\uFE2F]{4,}/;

export const imageFilePattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(png|jpg|webp)$/;

export const blockTypes = ["title", "text", "image", "box", "arrow"] as const;
export const tones = ["ink", "maroon"] as const;
export const fills = ["none", "ink", "parchment", "cream", "maroon", "gold"] as const;
export const directions = ["right", "left", "up", "down"] as const;

export function isCleanSlideText(value: string, multiline: boolean): boolean {
  if (!value.isWellFormed()) return false;
  if (controlCharacters.test(value) || hiddenCharacters.test(value) || stackedMarks.test(value)) return false;
  return multiline || !value.includes("\n");
}

function slideText(max: number, multiline: boolean) {
  return z
    .string()
    .max(max)
    .refine((value) => isCleanSlideText(value, multiline));
}

const idSchema = z.string().regex(/^[a-z0-9]{8}$/);
const coordinate = z.number().int().min(0).max(slideLimits.width);
const frame = {
  x: coordinate,
  y: coordinate,
  w: z.number().int().min(slideLimits.blockMinSize).max(slideLimits.width),
  h: z.number().int().min(slideLimits.blockMinSize).max(slideLimits.height),
};

const titleBlock = z.strictObject({
  id: idSchema,
  type: z.literal("title"),
  ...frame,
  text: slideText(slideLimits.titleLength, false),
  tone: z.enum(tones),
});

const textBlock = z.strictObject({
  id: idSchema,
  type: z.literal("text"),
  ...frame,
  text: slideText(slideLimits.textLength, true),
  tone: z.enum(tones),
});

const imageBlock = z.strictObject({
  id: idSchema,
  type: z.literal("image"),
  ...frame,
  file: z.string().regex(imageFilePattern),
  alt: slideText(slideLimits.altLength, false),
});

const boxBlock = z.strictObject({
  id: idSchema,
  type: z.literal("box"),
  ...frame,
  text: slideText(slideLimits.boxLength, false),
  fill: z.enum(fills),
});

const arrowBlock = z.strictObject({
  id: idSchema,
  type: z.literal("arrow"),
  ...frame,
  direction: z.enum(directions),
});

const blockSchema = z
  .discriminatedUnion("type", [titleBlock, textBlock, imageBlock, boxBlock, arrowBlock])
  .refine((block) => block.x + block.w <= slideLimits.width && block.y + block.h <= slideLimits.height);

const slideSchema = z
  .strictObject({ id: idSchema, blocks: z.array(blockSchema).max(slideLimits.blocksPerSlide) })
  .refine((slide) => slide.blocks.filter((block) => block.type === "box" && block.fill === "gold").length <= 1);

export const deckContentSchema = z
  .strictObject({ v: z.literal(1), slides: z.array(slideSchema).min(1).max(slideLimits.slidesMax) })
  .refine((deck) => {
    const ids = deck.slides.flatMap((slide) => [slide.id, ...slide.blocks.map((block) => block.id)]);
    return new Set(ids).size === ids.length;
  });

export type DeckContent = z.infer<typeof deckContentSchema>;
export type Slide = DeckContent["slides"][number];
export type Block = Slide["blocks"][number];
export type BlockType = Block["type"];
export type Tone = (typeof tones)[number];
export type Fill = (typeof fills)[number];
export type Direction = (typeof directions)[number];
export type Frame = { x: number; y: number; w: number; h: number };
export type TextBlock = Extract<Block, { text: string }>;

export function parseDeckContent(value: unknown): DeckContent | null {
  const parsed = deckContentSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export function contentBytes(content: DeckContent): number {
  return new TextEncoder().encode(JSON.stringify(content)).length;
}

export function isSavable(content: unknown): content is DeckContent {
  const parsed = parseDeckContent(content);
  return parsed !== null && contentBytes(parsed) <= slideLimits.contentMaxBytes;
}

export function hasText(block: Block): block is TextBlock {
  return block.type === "title" || block.type === "text" || block.type === "box";
}

export function slideSpeech(slide: Slide): string {
  return slide.blocks
    .map((block) => (hasText(block) ? block.text : block.type === "image" ? block.alt : ""))
    .map((text) => text.trim())
    .filter(Boolean)
    .join(". ");
}

export function imageFiles(content: DeckContent): string[] {
  const files = content.slides.flatMap((slide) => slide.blocks.flatMap((block) => (block.type === "image" ? [block.file] : [])));
  return [...new Set(files)];
}
