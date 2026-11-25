"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { DeckContent } from "@/lib/slides/schema";
import { SlideRenderer } from "./SlideRenderer";
import styles from "./print.module.css";

export type PrintDeckProps = { deckId: string; title: string; content: DeckContent };

const sheetWidth = 1280;

export function PrintDeck({ deckId, title, content }: PrintDeckProps) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let stale = false;
    document.fonts.ready.then(() => {
      if (!stale) setReady(true);
    });
    return () => {
      stale = true;
    };
  }, []);

  return (
    <div className={styles.page}>
      <div className={styles.controls}>
        <Link className={styles.back} href={`/decks/${deckId}`}>
          Back to the deck
        </Link>
        <h1 className={styles.title}>{title}</h1>
        <p className={styles.note}>
          Choose Save as PDF in the print window. Each slide is one 16:9 page. In Safari, choose Landscape.
        </p>
        <button type="button" className={styles.button} disabled={!ready} onClick={() => window.print()}>
          Print or save as PDF
        </button>
      </div>
      <ol className={styles.sheets}>
        {content.slides.map((slide) => (
          <li key={slide.id} className={styles.sheet}>
            <SlideRenderer slide={slide} imageBase={`/decks/${deckId}/images/`} width={sheetWidth} />
          </li>
        ))}
      </ol>
    </div>
  );
}
