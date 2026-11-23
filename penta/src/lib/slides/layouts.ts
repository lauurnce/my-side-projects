import type { MakeId } from "./ids";
import type { Block, BlockType } from "./schema";

export const layoutNames = ["title", "titleText", "twoColumns", "threeBoxes"] as const;

export type LayoutName = (typeof layoutNames)[number];

export const layoutLabels: Record<LayoutName, string> = {
  title: "Title",
  titleText: "Title and text",
  twoColumns: "Two columns",
  threeBoxes: "Three-box diagram",
};

export function layoutBlocks(name: LayoutName, makeId: MakeId): Block[] {
  return [{ id: makeId(), type: "title", x: 120, y: 330, w: 1360, h: 240, text: layoutLabels[name], tone: "ink" }];
}

export function newBlock(type: Exclude<BlockType, "image">, makeId: MakeId): Block {
  if (type === "arrow") return { id: makeId(), type, x: 720, y: 410, w: 160, h: 80, direction: "right" };
  if (type === "box") return { id: makeId(), type, x: 600, y: 350, w: 400, h: 200, text: "Box", fill: "none" };
  if (type === "title") return { id: makeId(), type, x: 120, y: 120, w: 1360, h: 200, text: "Title", tone: "ink" };
  return { id: makeId(), type, x: 120, y: 360, w: 1360, h: 360, text: "Text", tone: "ink" };
}

export function newImageBlock(file: string, makeId: MakeId): Block {
  return { id: makeId(), type: "image", x: 500, y: 250, w: 600, h: 400, file, alt: "" };
}
