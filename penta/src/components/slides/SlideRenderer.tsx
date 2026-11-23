import { memo } from "react";
import { slideLimits } from "@/lib/config";
import { hasText, type Block, type Direction, type Slide } from "@/lib/slides/schema";
import styles from "./slide.module.css";

export type SlideRendererProps = {
  slide: Slide;
  imageBase: string;
  width: number;
  editingBlockId?: string | null;
};

const arrowInset = 3;
const arrowHeadMax = 48;

export function blockTextClass(block: Block): string {
  return hasText(block) ? styles[block.type] : "";
}

export function arrowPath(w: number, h: number, direction: Direction): string {
  const horizontal = direction === "right" || direction === "left";
  const forward = direction === "right" || direction === "down";
  const length = horizontal ? w : h;
  const middle = (horizontal ? h : w) / 2;
  const head = Math.max(1, Math.min(arrowHeadMax, middle - arrowInset, length / 2 - arrowInset));
  const tip = forward ? length - arrowInset : arrowInset;
  const tail = forward ? arrowInset : length - arrowInset;
  const neck = forward ? tip - head : tip + head;
  const point = (along: number, across: number) => (horizontal ? `${along} ${across}` : `${across} ${along}`);

  return `M ${point(tail, middle)} L ${point(tip, middle)} M ${point(neck, middle - head)} L ${point(tip, middle)} L ${point(neck, middle + head)}`;
}

function blockContent(block: Block, imageBase: string, editingBlockId?: string | null) {
  if (block.type === "image") {
    return <img className={styles.image} src={imageBase + block.file} alt={block.alt} draggable={false} loading="lazy" decoding="async" />;
  }
  if (block.type === "arrow") {
    return (
      <svg className={styles.arrow} viewBox={`0 0 ${block.w} ${block.h}`} preserveAspectRatio="none" aria-hidden="true" focusable="false">
        <path d={arrowPath(block.w, block.h, block.direction)} />
      </svg>
    );
  }
  return block.id === editingBlockId ? null : block.text;
}

function blockClass(block: Block): string {
  return [styles.block, blockTextClass(block)].filter(Boolean).join(" ");
}

function SlideRendererView({ slide, imageBase, width, editingBlockId }: SlideRendererProps) {
  const scale = width / slideLimits.width;

  return (
    <div className={styles.frame} style={{ width, height: slideLimits.height * scale }} aria-hidden="true">
      <div className={styles.slide} style={{ transform: `scale(${scale})` }}>
        {slide.blocks.map((block) => (
          <div
            key={block.id}
            className={blockClass(block)}
            style={{ left: block.x, top: block.y, width: block.w, height: block.h }}
            data-block={block.id}
            data-type={block.type}
            data-tone={"tone" in block ? block.tone : undefined}
            data-fill={"fill" in block ? block.fill : undefined}
            data-direction={"direction" in block ? block.direction : undefined}
          >
            {blockContent(block, imageBase, editingBlockId)}
          </div>
        ))}
      </div>
    </div>
  );
}

export const SlideRenderer = memo(SlideRendererView);
