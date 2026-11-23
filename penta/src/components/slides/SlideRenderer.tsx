import { memo } from "react";
import { slideLimits } from "@/lib/config";
import { hasText, type Block, type Slide } from "@/lib/slides/schema";
import styles from "./slide.module.css";

export type SlideRendererProps = {
  slide: Slide;
  imageBase: string;
  width: number;
  editingBlockId?: string | null;
};

export function blockTextClass(block: Block): string {
  return styles[block.type] ?? "";
}

function SlideRendererView({ slide, width, editingBlockId }: SlideRendererProps) {
  const scale = width / slideLimits.width;

  return (
    <div className={styles.frame} style={{ width, height: slideLimits.height * scale }} aria-hidden="true">
      <div className={styles.slide} style={{ transform: `scale(${scale})` }}>
        {slide.blocks.map((block) => (
          <div
            key={block.id}
            className={`${styles.block} ${blockTextClass(block)}`}
            style={{ left: block.x, top: block.y, width: block.w, height: block.h }}
          >
            {hasText(block) && block.id !== editingBlockId ? block.text : null}
          </div>
        ))}
      </div>
    </div>
  );
}

export const SlideRenderer = memo(SlideRendererView);
