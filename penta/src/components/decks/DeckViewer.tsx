"use client";

import Link from "next/link";
import { BracketLabel } from "@/components/ui/BracketLabel";
import { deckFormat, type DeckDetail } from "@/lib/decks";
import type { LiveState } from "@/lib/live";
import type { DeckContent } from "@/lib/slides/schema";
import { SlideDeck } from "./viewer/SlideDeck";
import styles from "./viewer/viewer.module.css";

export type DeckSource = { url: string; length: number };

export type DeckViewerIdentity = { id: string; isOwner: boolean };

export type DeckViewerProps = {
  deck: DeckDetail;
  source: DeckSource | null;
  content?: DeckContent | null;
  contentVersion?: number | null;
  viewedSlides: number[];
  recordsViews: boolean;
  viewer: DeckViewerIdentity;
  initialLive: LiveState;
};

export function DeckViewer({
  deck,
  source,
  content = null,
  contentVersion = null,
  viewedSlides,
  recordsViews,
  viewer,
  initialLive,
}: DeckViewerProps) {
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

        {source || content ? (
          <SlideDeck
            deck={deck}
            source={source}
            content={content}
            contentVersion={contentVersion}
            viewedSlides={viewedSlides}
            recordsViews={recordsViews}
            viewer={viewer}
            initialLive={initialLive}
          />
        ) : (
          <p className={styles.notice}>This deck is not available right now. Try again in a moment.</p>
        )}

        <a className={styles.download} href={`/decks/${deck.id}/download`}>
          {deck.kind === "native" ? "Export PDF" : `Download ${format}`}
        </a>
        {deck.kind === "native" && viewer.isOwner && (
          <Link className={styles.download} href={`/decks/${deck.id}/edit`}>
            Edit slides
          </Link>
        )}
      </div>
    </div>
  );
}
