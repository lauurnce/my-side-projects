import Link from "next/link";
import { BracketLabel } from "@/components/ui/BracketLabel";
import type { DeckSummary } from "@/lib/decks";
import type { ClassOutline } from "@/lib/routes";
import { DeckGrid } from "./DeckGrid";
import { deckCountLabel, deckEyebrow, deckHref, liveByTitle, readyDecks, visibleLessonTitles } from "./helpers";
import styles from "./library.module.css";

export type DeckLibraryProps = {
  decks: DeckSummary[];
  classCode: string;
  outline: ClassOutline;
  liveIds?: ReadonlySet<string>;
};

const noLiveIds: ReadonlySet<string> = new Set();

export function DeckLibrary({ decks, classCode, outline, liveIds = noLiveIds }: DeckLibraryProps) {
  const ready = readyDecks(decks);
  const lessonTitles = visibleLessonTitles(outline);
  const liveNow = liveByTitle(ready, liveIds);

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
        <>
          {liveNow.map((deck) => (
            <p key={deck.id} className={styles.liveLine}>
              Live now: <Link href={deckHref(deck.id)}>{deck.title}</Link>. Open it and press Join live.
            </p>
          ))}
          <DeckGrid
            decks={ready}
            eyebrowFor={(deck) => deckEyebrow(deck, lessonTitles, classCode)}
            liveIds={liveIds}
          />
        </>
      )}
    </section>
  );
}
