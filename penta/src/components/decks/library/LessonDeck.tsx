import { BracketLabel } from "@/components/ui/BracketLabel";
import type { DeckSummary } from "@/lib/decks";
import { DeckGrid } from "./DeckGrid";
import { deckCountLabel } from "./helpers";
import styles from "./library.module.css";

export type LessonDeckProps = {
  decks: DeckSummary[];
  lessonTitle: string;
  liveIds?: ReadonlySet<string>;
};

export function LessonDeck({ decks, lessonTitle, liveIds }: LessonDeckProps) {
  if (decks.length === 0) return null;

  return (
    <section className={styles.section} aria-labelledby="lesson-decks-title">
      <div className={styles.head}>
        <h2 id="lesson-decks-title" className={styles.heading}>
          Slides for this lesson
        </h2>
        <BracketLabel>{deckCountLabel(decks.length)}</BracketLabel>
      </div>
      <DeckGrid decks={decks} eyebrowFor={() => lessonTitle} liveIds={liveIds} />
    </section>
  );
}
