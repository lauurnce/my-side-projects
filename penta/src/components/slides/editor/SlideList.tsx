import type { EditorDispatch } from "@/lib/slides/editor";
import type { DeckContent } from "@/lib/slides/schema";
import styles from "./list.module.css";

export type SlideListProps = {
  content: DeckContent;
  selectedSlide: number;
  imageBase: string;
  dispatch: EditorDispatch;
};

export function SlideList({ content, selectedSlide, dispatch }: SlideListProps) {
  return (
    <ol className={styles.list}>
      {content.slides.map((slide, index) => (
        <li key={slide.id}>
          <button
            type="button"
            aria-current={index === selectedSlide ? "true" : undefined}
            onClick={() => dispatch({ type: "selectSlide", index })}
          >
            Slide {index + 1}
          </button>
        </li>
      ))}
    </ol>
  );
}
