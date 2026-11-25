import { useCallback, useEffect, useMemo, useReducer, useRef, type KeyboardEvent, type PointerEvent } from "react";
import { useRouter } from "next/navigation";
import type { DeckSource, DeckViewerIdentity } from "@/components/decks/DeckViewer";
import { SlideRenderer } from "@/components/slides/SlideRenderer";
import { liveLimits } from "@/lib/config";
import type { DeckDetail } from "@/lib/decks";
import { followReducer, type LiveState } from "@/lib/live";
import { slideSpeech, type DeckContent } from "@/lib/slides/schema";
import { createClient } from "@/lib/supabase/client";
import { FollowBar } from "./live/FollowBar";
import { PresenterBar } from "./live/PresenterBar";
import { useLiveSession } from "./live/useLiveSession";
import { usePresenter } from "./live/usePresenter";
import { clampSlide, isTypingTarget, slideAnnouncement, slideForKey, swipeStep } from "./helpers";
import { SlideStrip } from "./SlideStrip";
import { useDeckDocument } from "./useDeckDocument";
import { useSeenSlides } from "./useSeenSlides";
import { useBoxSize, useSlideCanvas } from "./useSlideCanvas";
import styles from "./viewer.module.css";

export type SlideDeckProps = {
  deck: DeckDetail;
  source: DeckSource | null;
  content?: DeckContent | null;
  contentVersion?: number | null;
  viewedSlides: number[];
  recordsViews: boolean;
  viewer: DeckViewerIdentity;
  initialLive: LiveState;
};

function ArrowIcon({ path }: { path: string }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
      <path d={path} fill="none" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}

function ContentWatch({ shown, latest }: { shown: number; latest: number | null | undefined }) {
  const router = useRouter();

  useEffect(() => {
    if (typeof latest === "number" && latest !== shown) router.refresh();
  }, [router, shown, latest]);

  return null;
}

export function SlideDeck({
  deck,
  source,
  content = null,
  contentVersion = null,
  viewedSlides,
  recordsViews,
  viewer,
  initialLive,
}: SlideDeckProps) {
  const boxRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const supabase = useMemo(() => createClient(), []);
  const isOwner = viewer.isOwner;
  const [follow, dispatch] = useReducer(followReducer, {
    wanted: isOwner && initialLive.running ? initialLive.slide : 1,
    following: false,
    joined: false,
  });
  const wanted = follow.wanted;
  const following = useRef(false);
  const { live, link, lastReadAt, followers, read, setFollowing } = useLiveSession({
    deckId: deck.id,
    initial: initialLive,
    userId: viewer.id,
    isOwner,
  });

  const { status, doc, annotationMode, fail, retry } = useDeckDocument(deck.id, source);
  const total = content ? content.slides.length : (doc?.numPages ?? Math.max(deck.slideCount, 1));
  const slide = clampSlide(wanted, total);
  const box = useBoxSize(boxRef);
  const pdf = useSlideCanvas({ doc, annotationMode, slide, box, canvasRef, onError: fail });
  const built = content ? content.slides[slide - 1] : null;
  const painted = built ? true : pdf.painted;
  const text = built ? slideSpeech(built) : pdf.text;
  const ready = content !== null || doc !== null;

  const deckId = deck.id;
  const viewerId = viewer.id;
  const record = useCallback(
    async (slideNo: number) => {
      if (following.current) {
        await new Promise((resolve) => setTimeout(resolve, Math.random() * liveLimits.seenJitterMilliseconds));
      }
      const { error } = await supabase
        .from("deck_views")
        .upsert(
          { deck_id: deckId, student_id: viewerId, slide_no: slideNo },
          { onConflict: "deck_id,student_id,slide_no", ignoreDuplicates: true },
        );
      return !error;
    },
    [supabase, deckId, viewerId],
  );
  const seen = useSeenSlides({
    enabled: recordsViews,
    initial: viewedSlides,
    slide,
    painted,
    limit: deck.slideCount,
    record,
  });

  const adopt = useCallback((next: number) => dispatch({ type: "move", slide: next }), []);
  const presenter = usePresenter({ deckId, enabled: isOwner, live, slide, read, adopt });

  useEffect(() => {
    if (!isOwner) dispatch({ type: "live", live });
  }, [isOwner, live]);

  useEffect(() => {
    following.current = follow.following;
    if (!isOwner) setFollowing(follow.following);
  }, [isOwner, follow.following, setFollowing]);

  const goTo = (next: number) => {
    const target = clampSlide(next, total);
    dispatch({ type: "move", slide: target });
    presenter.move(target);
  };

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

  const failed = !content && status === "failed";
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
      {isOwner ? (
        <PresenterBar
          presenting={presenter.presenting}
          busy={presenter.busy}
          ready={ready}
          followers={followers}
          link={link}
          unsent={presenter.unsent}
          lastReadAt={lastReadAt}
          problem={presenter.problem}
          onPresent={presenter.present}
          onEnd={presenter.end}
        />
      ) : (
        <FollowBar
          running={live.running}
          following={follow.following}
          joined={follow.joined}
          link={link}
          lastReadAt={lastReadAt}
          liveSlide={live.slide}
          onJoin={() => dispatch({ type: "join", slide: live.slide })}
          onBrowse={() => dispatch({ type: "browse" })}
        />
      )}
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
          {built ? (
            box && <SlideRenderer slide={built} imageBase={`/decks/${deck.id}/images/`} width={box.width} />
          ) : (
            <canvas ref={canvasRef} className={styles.canvas} data-painted={painted} aria-hidden="true" />
          )}
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

      {content && contentVersion !== null && <ContentWatch shown={contentVersion} latest={live.contentVersion} />}
      <p className="visually-hidden" aria-live="polite" aria-atomic="true">
        {text === null ? "" : slideAnnouncement(slide, total, text)}
      </p>
    </div>
  );
}
