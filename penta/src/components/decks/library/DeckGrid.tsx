import { DeckThumb } from "@/components/ui/DeckThumb";
import { deckFormat, type DeckSummary } from "@/lib/decks";
import { deckHref } from "./helpers";
import styles from "./library.module.css";

export type DeckGridProps = {
  decks: DeckSummary[];
  eyebrowFor: (deck: DeckSummary) => string;
  compact?: boolean;
  liveIds?: ReadonlySet<string>;
};

export function DeckGrid({ decks, eyebrowFor, compact, liveIds }: DeckGridProps) {
  return (
    <ul className={compact ? `${styles.grid} ${styles.compact}` : styles.grid}>
      {decks.map((deck) => (
        <li key={deck.id} className={styles.cell}>
          <DeckThumb
            href={deckHref(deck.id)}
            eyebrow={eyebrowFor(deck)}
            title={deck.title}
            slideCount={deck.slideCount}
            format={deckFormat(deck.kind)}
            viewedCount={deck.viewedCount}
            live={liveIds?.has(deck.id)}
          />
        </li>
      ))}
    </ul>
  );
}
