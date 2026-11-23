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
