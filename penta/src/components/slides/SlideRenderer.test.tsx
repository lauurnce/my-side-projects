import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import type { Block, Slide } from "@/lib/slides/schema";
import { SlideRenderer, arrowPath, blockTextClass } from "./SlideRenderer";

afterEach(cleanup);

const file = "0a1b2c3d-0a1b-4c3d-8e5f-0a1b2c3d4e5f.png";
const imageBase = "https://files.test/decks/deck-1/";

const title: Block = { id: "title001", type: "title", x: 80, y: 60, w: 1200, h: 200, text: "Systems integration", tone: "maroon" };
const text: Block = { id: "text0001", type: "text", x: 80, y: 300, w: 700, h: 400, text: "First line\nSecond line", tone: "ink" };
const image: Block = { id: "image001", type: "image", x: 820, y: 300, w: 700, h: 400, file, alt: "A network diagram" };
const box: Block = { id: "box00001", type: "box", x: 80, y: 740, w: 400, h: 120, text: "Step one", fill: "gold" };
const arrow: Block = { id: "arrow001", type: "arrow", x: 500, y: 760, w: 300, h: 80, direction: "left" };
const slide: Slide = { id: "slide001", blocks: [title, text, image, box, arrow] };

function renderSlide(blocks: Block[] = slide.blocks, width = 800, editingBlockId?: string) {
  const { container } = render(<SlideRenderer slide={{ id: "slide001", blocks }} imageBase={imageBase} width={width} editingBlockId={editingBlockId} />);
  return container.firstElementChild as HTMLElement;
}

function blockNode(root: HTMLElement, id: string) {
  return root.querySelector(`[data-block="${id}"]`) as HTMLElement;
}

describe("SlideRenderer", () => {
  it("places every block at its frame in array order", () => {
    const root = renderSlide();
    const nodes = [...root.querySelectorAll<HTMLElement>("[data-block]")];
    expect(nodes.map((node) => node.dataset.block)).toEqual(slide.blocks.map((block) => block.id));
    nodes.forEach((node, index) => {
      const block = slide.blocks[index];
      expect(node.dataset.type).toBe(block.type);
      expect(node.style.left).toBe(`${block.x}px`);
      expect(node.style.top).toBe(`${block.y}px`);
      expect(node.style.width).toBe(`${block.w}px`);
      expect(node.style.height).toBe(`${block.h}px`);
    });
  });

  it("exposes tone, fill and direction as data attributes", () => {
    const root = renderSlide();
    expect(blockNode(root, title.id).dataset.tone).toBe("maroon");
    expect(blockNode(root, text.id).dataset.tone).toBe("ink");
    expect(blockNode(root, box.id).dataset.fill).toBe("gold");
    expect(blockNode(root, arrow.id).dataset.direction).toBe("left");
    expect(blockNode(root, image.id).hasAttribute("data-tone")).toBe(false);
    expect(blockNode(root, title.id).hasAttribute("data-fill")).toBe(false);
  });

  it("puts the text class on text blocks", () => {
    const root = renderSlide();
    [title, text, box].forEach((block) => {
      expect(blockNode(root, block.id).classList.contains(blockTextClass(block))).toBe(true);
    });
  });

  it("renders markup in text as plain text", () => {
    const script = "<script>alert(1)</script>";
    const broken = "<img src=x onerror=alert(1)>";
    const root = renderSlide([
      { ...title, text: script },
      { ...text, text: broken },
      { ...box, text: script },
      image,
    ]);
    expect(blockNode(root, title.id).textContent).toBe(script);
    expect(blockNode(root, text.id).textContent).toBe(broken);
    expect(blockNode(root, box.id).textContent).toBe(script);
    expect(root.querySelectorAll("script")).toHaveLength(0);
    expect(root.querySelectorAll("img")).toHaveLength(1);
    expect(root.querySelectorAll("a")).toHaveLength(0);
  });

  it("keeps line breaks in the text node", () => {
    expect(blockNode(renderSlide(), text.id).textContent).toBe("First line\nSecond line");
  });

  it("builds the image from the base and the file", () => {
    const root = renderSlide();
    const img = root.querySelector("img") as HTMLImageElement;
    expect(img.getAttribute("src")).toBe(imageBase + file);
    expect(img.getAttribute("alt")).toBe("A network diagram");
    expect(img.getAttribute("draggable")).toBe("false");
    expect(img.getAttribute("loading")).toBe("lazy");
    expect(img.getAttribute("decoding")).toBe("async");
    expect(img.parentElement).toBe(blockNode(root, image.id));
  });

  it("is hidden from assistive technology and holds nothing focusable", () => {
    const root = renderSlide();
    expect(root.getAttribute("aria-hidden")).toBe("true");
    expect(root.querySelectorAll("a[href], button, input, textarea, select, [tabindex], [contenteditable]")).toHaveLength(0);
  });

  it.each([
    [800, 450, 0.5],
    [320, 180, 0.2],
  ])("scales the canvas to a width of %i", (width, height, scale) => {
    const root = renderSlide(slide.blocks, width);
    expect(root.style.width).toBe(`${width}px`);
    expect(root.style.height).toBe(`${height}px`);
    expect((root.firstElementChild as HTMLElement).style.transform).toBe(`scale(${scale})`);
  });

  it("leaves out only the text of the block being edited", () => {
    const root = renderSlide(slide.blocks, 800, box.id);
    const editing = blockNode(root, box.id);
    expect(editing.textContent).toBe("");
    expect(editing.dataset.fill).toBe("gold");
    expect(editing.style.width).toBe(`${box.w}px`);
    expect(blockNode(root, title.id).textContent).toBe(title.text);
    expect(blockNode(root, text.id).textContent).toBe(text.text);
  });

  it("draws the arrow as a hidden svg sized to the block", () => {
    const svg = blockNode(renderSlide(), arrow.id).querySelector("svg") as SVGSVGElement;
    expect(svg.getAttribute("aria-hidden")).toBe("true");
    expect(svg.getAttribute("viewBox")).toBe(`0 0 ${arrow.w} ${arrow.h}`);
    expect(svg.querySelector("path")?.getAttribute("d")).toBe(arrowPath(arrow.w, arrow.h, "left"));
  });
});

describe("blockTextClass", () => {
  it("gives title, text and box their own class", () => {
    const classes = [title, text, box].map(blockTextClass);
    classes.forEach((name) => expect(name.length).toBeGreaterThan(0));
    expect(new Set(classes).size).toBe(3);
  });

  it("gives image and arrow no text class", () => {
    expect(blockTextClass(image)).toBe("");
    expect(blockTextClass(arrow)).toBe("");
  });
});

describe("arrowPath", () => {
  it("differs for each direction", () => {
    const paths = (["right", "left", "up", "down"] as const).map((direction) => arrowPath(300, 300, direction));
    expect(new Set(paths).size).toBe(4);
  });

  it("ends the shaft at the side it points to", () => {
    expect(arrowPath(300, 80, "right")).toContain("L 297 40 M");
    expect(arrowPath(300, 80, "left")).toContain("L 3 40 M");
    expect(arrowPath(80, 300, "down")).toContain("L 40 297 M");
    expect(arrowPath(80, 300, "up")).toContain("L 40 3 M");
  });

  it("keeps the head the same shape when the block is stretched", () => {
    expect(arrowPath(300, 80, "right")).toContain("M 260 3 L 297 40 L 260 77");
    expect(arrowPath(900, 80, "right")).toContain("M 860 3 L 897 40 L 860 77");
  });

  it("keeps the head inside a block of the smallest size", () => {
    expect(arrowPath(24, 24, "right")).toBe("M 3 12 L 21 12 M 12 3 L 21 12 L 12 21");
  });
});
