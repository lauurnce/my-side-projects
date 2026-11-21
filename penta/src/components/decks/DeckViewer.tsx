"use client";

import Link from "next/link";
import { BracketLabel } from "@/components/ui/BracketLabel";
import { deckFormat, type DeckDetail } from "@/lib/decks";
import { SlideDeck } from "./viewer/SlideDeck";
import styles from "./viewer/viewer.module.css";

export type DeckSource = { url: string; length: number };

export type DeckViewerProps = {
  deck: DeckDetail;
  source: DeckSource | null;
  viewedSlides: number[];
  recordsViews: boolean;
};

export function DeckViewer({ deck, source, viewedSlides, recordsViews }: DeckViewerProps) {
  const format = deckFormat(deck.kind);

  return (
    <div className={styles.page}>
      <div className={styles.inner}>
        <header className={styles.header}>
          <Link className={styles.back} href={`/classes/${deck.classId}`}>
            Back to the class
          </Link>
          <p className={styles.labels}>
            <BracketLabel>Layer 02 · Decks</BracketLabel>
            <BracketLabel>{format}</BracketLabel>
          </p>
          <h1 className={styles.title}>{deck.title}</h1>
        </header>

        {source ? (
          <SlideDeck deck={deck} source={source} viewedSlides={viewedSlides} recordsViews={recordsViews} />
        ) : (
          <p className={styles.notice}>This deck is not available right now. Try again in a moment.</p>
        )}

        <a className={styles.download} href={`/decks/${deck.id}/download`}>
          Download {format}
        </a>
      </div>
    </div>
  );
}
