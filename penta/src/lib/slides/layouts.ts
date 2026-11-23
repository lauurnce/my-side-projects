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

function titleLayout(makeId: MakeId): Block[] {
  return [
    { id: makeId(), type: "title", x: 120, y: 290, w: 1360, h: 200, text: "Message queues", tone: "ink" },
    { id: makeId(), type: "text", x: 120, y: 510, w: 1360, h: 100, text: "How systems talk without waiting for each other.", tone: "maroon" },
  ];
}

function titleTextLayout(makeId: MakeId): Block[] {
  return [
    { id: makeId(), type: "title", x: 120, y: 100, w: 1360, h: 190, text: "Why use a queue", tone: "ink" },
    {
      id: makeId(),
      type: "text",
      x: 120,
      y: 330,
      w: 1360,
      h: 450,
      text: "The sender leaves a message and moves on.\nThe receiver reads it when it is ready.\nNeither one has to know the other is online.",
      tone: "ink",
    },
  ];
}

function twoColumnsLayout(makeId: MakeId): Block[] {
  return [
    { id: makeId(), type: "title", x: 120, y: 100, w: 1360, h: 190, text: "Direct call or queue", tone: "ink" },
    {
      id: makeId(),
      type: "text",
      x: 120,
      y: 330,
      w: 650,
      h: 450,
      text: "Direct call\nThe sender waits for an answer.\nIf the receiver is down, the call fails.",
      tone: "ink",
    },
    {
      id: makeId(),
      type: "text",
      x: 830,
      y: 330,
      w: 650,
      h: 450,
      text: "Queue\nThe sender does not wait.\nIf the receiver is down, the message stays in line.",
      tone: "ink",
    },
  ];
}

function threeBoxesLayout(makeId: MakeId): Block[] {
  return [
    { id: makeId(), type: "text", x: 120, y: 110, w: 1360, h: 60, text: "How a message travels", tone: "maroon" },
    { id: makeId(), type: "box", x: 120, y: 330, w: 360, h: 240, text: "Producer", fill: "none" },
    { id: makeId(), type: "arrow", x: 500, y: 410, w: 100, h: 80, direction: "right" },
    { id: makeId(), type: "box", x: 620, y: 330, w: 360, h: 240, text: "Broker", fill: "ink" },
    { id: makeId(), type: "arrow", x: 1000, y: 410, w: 100, h: 80, direction: "right" },
    { id: makeId(), type: "box", x: 1120, y: 330, w: 360, h: 240, text: "Consumer", fill: "none" },
    {
      id: makeId(),
      type: "text",
      x: 120,
      y: 630,
      w: 1360,
      h: 120,
      text: "The producer sends, the broker holds, the consumer reads.",
      tone: "ink",
    },
  ];
}

const layouts: Record<LayoutName, (makeId: MakeId) => Block[]> = {
  title: titleLayout,
  titleText: titleTextLayout,
  twoColumns: twoColumnsLayout,
  threeBoxes: threeBoxesLayout,
};

export function layoutBlocks(name: LayoutName, makeId: MakeId): Block[] {
  return layouts[name](makeId);
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
