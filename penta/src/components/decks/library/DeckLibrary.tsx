import { BracketLabel } from "@/components/ui/BracketLabel";
import type { DeckSummary } from "@/lib/decks";
import type { ClassOutline } from "@/lib/routes";
import { DeckGrid } from "./DeckGrid";
import { deckCountLabel, deckEyebrow, readyDecks, visibleLessonTitles } from "./helpers";
import styles from "./library.module.css";

export type DeckLibraryProps = {
  decks: DeckSummary[];
  classCode: string;
  outline: ClassOutline;
};

export function DeckLibrary({ decks, classCode, outline }: DeckLibraryProps) {
  const ready = readyDecks(decks);
  const lessonTitles = visibleLessonTitles(outline);

  return (
    <section className={styles.section} aria-labelledby="class-decks-title">
      <div className={styles.head}>
        <h2 id="class-decks-title" className={styles.heading}>
          Decks
        </h2>
        <BracketLabel>{deckCountLabel(ready.length)}</BracketLabel>
      </div>
      {ready.length === 0 ? (
        <p className={styles.empty}>No decks yet. Decks show up here when your teacher uploads one.</p>
      ) : (
        <DeckGrid decks={ready} eyebrowFor={(deck) => deckEyebrow(deck, lessonTitles, classCode)} />
      )}
    </section>
  );
}
