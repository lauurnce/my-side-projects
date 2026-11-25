import { memo, useId, useState } from "react";
import { SlideRenderer } from "@/components/slides/SlideRenderer";
import { slideLimits } from "@/lib/config";
import type { EditorDispatch } from "@/lib/slides/editor";
import { copySlide, newId } from "@/lib/slides/ids";
import { layoutBlocks, layoutLabels, layoutNames, type LayoutName } from "@/lib/slides/layouts";
import type { DeckContent, Slide } from "@/lib/slides/schema";
import styles from "./list.module.css";

export type SlideListProps = {
  content: DeckContent;
  selectedSlide: number;
  imageBase: string;
  dispatch: EditorDispatch;
};

const thumbnailWidth = 176;

const iconPaths = {
  up: "M12 19V5M5 12l7-7 7 7",
  down: "M12 5v14M5 12l7 7 7-7",
  duplicate: "M9 9h11v11H9zM5 15H4V4h11v1",
  remove: "M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3",
};

type IconButtonProps = {
  label: string;
  path: string;
  disabled: boolean;
  onClick: () => void;
};

function IconButton({ label, path, disabled, onClick }: IconButtonProps) {
  return (
    <button type="button" className={styles.icon} aria-label={label} title={label} disabled={disabled} onClick={onClick}>
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d={path} />
      </svg>
    </button>
  );
}

type SlideItemProps = {
  slide: Slide;
  index: number;
  total: number;
  selected: boolean;
  imageBase: string;
  dispatch: EditorDispatch;
};

function SlideItemView({ slide, index, total, selected, imageBase, dispatch }: SlideItemProps) {
  const number = index + 1;

  return (
    <li className={styles.item}>
      <button
        type="button"
        className={styles.thumb}
        aria-current={selected ? "true" : undefined}
        onClick={() => dispatch({ type: "selectSlide", index })}
      >
        <span className={styles.number}>
          <span className="visually-hidden">Slide </span>
          {String(number).padStart(2, "0")}
        </span>
        <SlideRenderer slide={slide} imageBase={imageBase} width={thumbnailWidth} />
      </button>
      <div className={styles.actions}>
        <IconButton
          label={`Move slide ${number} up`}
          path={iconPaths.up}
          disabled={index === 0}
          onClick={() => dispatch({ type: "moveSlide", from: index, to: index - 1 })}
        />
        <IconButton
          label={`Move slide ${number} down`}
          path={iconPaths.down}
          disabled={index === total - 1}
          onClick={() => dispatch({ type: "moveSlide", from: index, to: index + 1 })}
        />
        <IconButton
          label={`Duplicate slide ${number}`}
          path={iconPaths.duplicate}
          disabled={total >= slideLimits.slidesMax}
          onClick={() => dispatch({ type: "addSlide", slide: copySlide(slide), at: index + 1 })}
        />
        <IconButton
          label={`Delete slide ${number}`}
          path={iconPaths.remove}
          disabled={total <= 1}
          onClick={() => dispatch({ type: "deleteSlide", index })}
        />
      </div>
    </li>
  );
}

const SlideItem = memo(SlideItemView);

type AddSlideProps = {
  full: boolean;
  onAdd: (layout: LayoutName) => void;
};

function AddSlide({ full, onAdd }: AddSlideProps) {
  const [layout, setLayout] = useState<LayoutName>("titleText");
  const selectId = useId();

  return (
    <div className={styles.add}>
      <label className={styles.label} htmlFor={selectId}>
        Layout
      </label>
      <select id={selectId} className={styles.select} value={layout} onChange={(event) => setLayout(event.target.value as LayoutName)}>
        {layoutNames.map((name) => (
          <option key={name} value={name}>
            {layoutLabels[name]}
          </option>
        ))}
      </select>
      <button type="button" className={styles.addButton} disabled={full} onClick={() => onAdd(layout)}>
        Add slide
      </button>
    </div>
  );
}

export function SlideList({ content, selectedSlide, imageBase, dispatch }: SlideListProps) {
  const total = content.slides.length;

  function addSlide(layout: LayoutName) {
    dispatch({ type: "addSlide", slide: { id: newId(), blocks: layoutBlocks(layout, newId) }, at: selectedSlide + 1 });
  }

  return (
    <div className={styles.panel}>
      <AddSlide full={total >= slideLimits.slidesMax} onAdd={addSlide} />
      <p className={styles.count}>
        {total} of {slideLimits.slidesMax} slides
      </p>
      <ol className={styles.list}>
        {content.slides.map((slide, index) => (
          <SlideItem key={slide.id} slide={slide} index={index} total={total} selected={index === selectedSlide} imageBase={imageBase} dispatch={dispatch} />
        ))}
      </ol>
    </div>
  );
}
