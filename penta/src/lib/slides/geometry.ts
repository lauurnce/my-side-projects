import { slideLimits } from "@/lib/config";
import type { Frame } from "./schema";

export type Corner = "nw" | "ne" | "sw" | "se";

export function clampFrame(frame: Frame): Frame {
  const w = Math.round(Math.min(Math.max(frame.w, slideLimits.blockMinSize), slideLimits.width));
  const h = Math.round(Math.min(Math.max(frame.h, slideLimits.blockMinSize), slideLimits.height));
  const x = Math.round(Math.min(Math.max(frame.x, 0), slideLimits.width - w));
  const y = Math.round(Math.min(Math.max(frame.y, 0), slideLimits.height - h));
  return { x, y, w, h };
}

export type KeyFrameOptions = { fine: boolean; resize: boolean };

const keyDirections: Record<string, readonly [number, number]> = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
};

function between(value: number, low: number, high: number): number {
  return Math.round(Math.min(Math.max(value, low), high));
}

export function isArrowKey(key: string): boolean {
  return Object.hasOwn(keyDirections, key);
}

export function sameFrame(first: Frame, second: Frame): boolean {
  return first.x === second.x && first.y === second.y && first.w === second.w && first.h === second.h;
}

export function moveFrame(frame: Frame, dx: number, dy: number): Frame {
  return clampFrame({ ...frame, x: frame.x + dx, y: frame.y + dy });
}

export function resizeFrame(frame: Frame, corner: Corner, dx: number, dy: number): Frame {
  const start = clampFrame(frame);
  const min = slideLimits.blockMinSize;
  const right = start.x + start.w;
  const bottom = start.y + start.h;
  const west = corner === "nw" || corner === "sw";
  const north = corner === "nw" || corner === "ne";
  const x = west ? between(start.x + dx, 0, right - min) : start.x;
  const y = north ? between(start.y + dy, 0, bottom - min) : start.y;
  const w = west ? right - x : between(right + dx, start.x + min, slideLimits.width) - x;
  const h = north ? bottom - y : between(bottom + dy, start.y + min, slideLimits.height) - y;
  return { x, y, w, h };
}

export function keyFrame(frame: Frame, key: string, { fine, resize }: KeyFrameOptions): Frame {
  if (!isArrowKey(key)) return clampFrame(frame);
  const direction = keyDirections[key];
  const step = fine ? slideLimits.keyFineStep : slideLimits.keyStep;
  const dx = direction[0] * step;
  const dy = direction[1] * step;
  return resize ? resizeFrame(frame, "se", dx, dy) : moveFrame(frame, dx, dy);
}
