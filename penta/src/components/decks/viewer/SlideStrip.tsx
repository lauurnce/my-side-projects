import { useEffect, useRef } from "react";
import { centeredScroll, markerLabel, markerState } from "./helpers";
import styles from "./viewer.module.css";

export type SlideStripProps = {
  total: number;
  current: number;
  seen: ReadonlySet<number>;
  onSelect: (slide: number) => void;
};

export function SlideStrip({ total, current, seen, onSelect }: SlideStripProps) {
  const stripRef = useRef<HTMLDivElement>(null);
  const currentRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const strip = stripRef.current;
    const marker = currentRef.current;
    if (!strip || !marker) return;
    strip.scrollLeft = centeredScroll(marker.offsetLeft - strip.offsetLeft, marker.offsetWidth, strip.clientWidth);
    if (strip.contains(document.activeElement)) marker.focus({ preventScroll: true });
  }, [current]);

  return (
    <div ref={stripRef} className={styles.markers} role="group" aria-label="Slides">
      {Array.from({ length: total }, (_, index) => index + 1).map((slide) => {
        const state = markerState(slide, current, seen);
        return (
          <button
            key={slide}
            ref={state === "current" ? currentRef : undefined}
            type="button"
            className={styles.marker}
            data-state={state}
            aria-label={markerLabel(slide, seen.has(slide))}
            aria-current={state === "current" ? "true" : undefined}
            tabIndex={state === "current" ? 0 : -1}
            onClick={() => onSelect(slide)}
          >
            <span className={styles.markerFace} />
          </button>
        );
      })}
    </div>
  );
}
