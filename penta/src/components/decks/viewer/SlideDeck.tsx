import { useCallback, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { recordSlideView } from "@/app/decks/view-actions";
import type { DeckSource } from "@/components/decks/DeckViewer";
import type { DeckDetail } from "@/lib/decks";
import { clampSlide, isTypingTarget, slideAnnouncement, slideForKey, swipeStep } from "./helpers";
import { SlideStrip } from "./SlideStrip";
import { useDeckDocument } from "./useDeckDocument";
import { useSeenSlides } from "./useSeenSlides";
import { useBoxSize, useSlideCanvas } from "./useSlideCanvas";
import styles from "./viewer.module.css";

export type SlideDeckProps = {
  deck: DeckDetail;
  source: DeckSource;
  viewedSlides: number[];
  recordsViews: boolean;
};

function ArrowIcon({ path }: { path: string }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
      <path d={path} fill="none" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}

export function SlideDeck({ deck, source, viewedSlides, recordsViews }: SlideDeckProps) {
  const boxRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const [wanted, setWanted] = useState(1);

  const { status, doc, annotationMode, fail, retry } = useDeckDocument(deck.id, source);
  const total = doc?.numPages ?? Math.max(deck.slideCount, 1);
  const slide = clampSlide(wanted, total);
  const box = useBoxSize(boxRef);
  const { painted, text } = useSlideCanvas({ doc, annotationMode, slide, box, canvasRef, onError: fail });

  const deckId = deck.id;
  const record = useCallback(
    (slideNo: number) => recordSlideView({ deckId, slideNo }).then((result) => result.ok),
    [deckId],
  );
  const seen = useSeenSlides({
    enabled: recordsViews,
    initial: viewedSlides,
    slide,
    painted,
    limit: deck.slideCount,
    record,
  });

  const goTo = (next: number) => setWanted(clampSlide(next, total));

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    if (isTypingTarget(event.target)) return;
    const next = slideForKey(event.key, slide, total);
    if (next === null) return;
    event.preventDefault();
    goTo(next);
  };

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    touchStart.current = event.pointerType === "touch" ? { x: event.clientX, y: event.clientY } : null;
  };

  const onPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    const start = touchStart.current;
    touchStart.current = null;
    if (!start) return;
    const step = swipeStep(event.clientX - start.x, event.clientY - start.y);
    if (step !== 0) goTo(slide + step);
  };

  const failed = status === "failed";
  const viewedCount = Math.min(seen.size, deck.slideCount);

  return (
    <div
      className={styles.viewer}
      role="group"
      aria-roledescription="slide deck"
      aria-label={`Slides of ${deck.title}`}
      tabIndex={0}
      onKeyDown={onKeyDown}
    >
      <p className={styles.meta}>
        <span>
          Slide {slide} / {total}
        </span>
        {recordsViews && (
          <span>
            Viewed {viewedCount} / {deck.slideCount}
          </span>
        )}
      </p>

      <div
        className={styles.stage}
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onPointerCancel={() => {
          touchStart.current = null;
        }}
      >
        <div ref={boxRef} className={styles.slide}>
          <canvas ref={canvasRef} className={styles.canvas} data-painted={painted} aria-hidden="true" />
          {!painted && !failed && <p className={styles.loading}>Loading slide {slide}</p>}
          {failed && (
            <div className={styles.failure} role="alert">
              <p className={styles.failureText}>This deck could not be loaded. Reload the deck.</p>
              <button type="button" className={styles.reload} onClick={retry}>
                Reload
              </button>
            </div>
          )}
        </div>
      </div>

      <div className={styles.strip}>
        <button
          type="button"
          className={styles.arrow}
          aria-label="Previous slide"
          disabled={slide <= 1}
          onClick={() => goTo(slide - 1)}
        >
          <ArrowIcon path="M15 6 L9 12 L15 18" />
        </button>
        <SlideStrip total={total} current={slide} seen={seen} onSelect={goTo} />
        <button
          type="button"
          className={styles.arrow}
          aria-label="Next slide"
          disabled={slide >= total}
          onClick={() => goTo(slide + 1)}
        >
          <ArrowIcon path="M9 6 L15 12 L9 18" />
        </button>
      </div>

      <p className="visually-hidden" aria-live="polite" aria-atomic="true">
        {text === null ? "" : slideAnnouncement(slide, total, text)}
      </p>
    </div>
  );
}
