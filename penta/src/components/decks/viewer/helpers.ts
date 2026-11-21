export type Box = { width: number; height: number };

export type CanvasSize = { width: number; height: number; scale: number };

export type MarkerState = "idle" | "viewed" | "current";

export const canvasLimits = { pixelRatioMax: 2, pixelsMax: 4_000_000 } as const;

export const swipeThreshold = 48;

export function clampSlide(slide: number, total: number): number {
  return Math.min(Math.max(1, Math.trunc(slide)), Math.max(1, total));
}

export function slideForKey(key: string, slide: number, total: number): number | null {
  if (key === "ArrowLeft" || key === "PageUp") return clampSlide(slide - 1, total);
  if (key === "ArrowRight" || key === "PageDown") return clampSlide(slide + 1, total);
  if (key === "Home") return 1;
  if (key === "End") return clampSlide(total, total);
  return null;
}

export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  return ["INPUT", "SELECT", "TEXTAREA"].includes(target.tagName);
}

export function swipeStep(deltaX: number, deltaY: number): -1 | 0 | 1 {
  if (Math.abs(deltaX) < swipeThreshold) return 0;
  if (Math.abs(deltaX) < Math.abs(deltaY) * 1.5) return 0;
  return deltaX < 0 ? 1 : -1;
}

export function canvasSize(page: Box, box: Box, pixelRatio: number): CanvasSize | null {
  if (page.width <= 0 || page.height <= 0 || box.width <= 0 || box.height <= 0) return null;
  const fit = Math.min(box.width / page.width, box.height / page.height);
  const ratio = Math.min(Math.max(pixelRatio || 1, 1), canvasLimits.pixelRatioMax);
  const wanted = fit * ratio;
  const pixels = page.width * page.height * wanted * wanted;
  const scale = pixels > canvasLimits.pixelsMax ? wanted * Math.sqrt(canvasLimits.pixelsMax / pixels) : wanted;
  const width = Math.floor(page.width * scale);
  const height = Math.floor(page.height * scale);
  if (width < 1 || height < 1) return null;
  return { width, height, scale };
}

function partText(part: object): string {
  if (!("str" in part) || typeof part.str !== "string") return "";
  return "hasEOL" in part && part.hasEOL ? `${part.str}\n` : part.str;
}

export function slideText(parts: readonly object[]): string {
  return parts
    .map(partText)
    .join("")
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter((line) => line.length > 0)
    .join("\n");
}

export function slideAnnouncement(slide: number, total: number, text: string): string {
  const place = `Slide ${slide} of ${total}. `;
  if (text.length === 0) return `${place}No readable text on this slide. Download the file to read it.`;
  return place + text;
}

export function markerState(slide: number, current: number, seen: ReadonlySet<number>): MarkerState {
  if (slide === current) return "current";
  return seen.has(slide) ? "viewed" : "idle";
}

export function markerLabel(slide: number, viewed: boolean): string {
  return viewed ? `Slide ${slide}, viewed` : `Slide ${slide}`;
}

export function centeredScroll(markerLeft: number, markerWidth: number, stripWidth: number): number {
  return Math.max(0, markerLeft - (stripWidth - markerWidth) / 2);
}
