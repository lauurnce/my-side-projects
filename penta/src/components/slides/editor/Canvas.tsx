import { SlideRenderer } from "@/components/slides/SlideRenderer";
import type { EditorDispatch } from "@/lib/slides/editor";
import type { Slide } from "@/lib/slides/schema";
import styles from "./canvas.module.css";

export type CanvasProps = {
  slide: Slide;
  selectedBlock: string | null;
  imageBase: string;
  dispatch: EditorDispatch;
};

export function Canvas({ slide, imageBase }: CanvasProps) {
  return (
    <div className={styles.canvas}>
      <SlideRenderer slide={slide} imageBase={imageBase} width={960} />
    </div>
  );
}
