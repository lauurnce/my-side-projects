import Link from "next/link";
import type { Role } from "@/lib/auth";
import { deckFormat, type DeckSummary } from "@/lib/decks";
import { DeckGrid } from "./DeckGrid";
import { classCodes, deckHref, hubDeckLimit, slideCountLabel, unknownClassCode, viewedTotalsLabel } from "./helpers";
import styles from "./library.module.css";

export type HubDeckListProps = {
  role: Role;
  decks: DeckSummary[];
  classes: { id: string; code: string }[];
};

function TeacherRows({ decks, codeFor }: { decks: DeckSummary[]; codeFor: (deck: DeckSummary) => string }) {
  return (
    <ul className={styles.rows}>
      {decks.map((deck) => (
        <li key={deck.id} className={styles.cell}>
          <a className={styles.row} href={deckHref(deck.id)}>
            <span className={styles.rowTitle}>{deck.title}</span>
            <span className={styles.rowMeta}>
              <span>
                {slideCountLabel(deck.slideCount)} · {deckFormat(deck.kind)}
              </span>
              <span>{codeFor(deck)}</span>
            </span>
          </a>
        </li>
      ))}
    </ul>
  );
}

export function HubDeckList({ role, decks, classes }: HubDeckListProps) {
  const codes = classCodes(classes);
  const codeFor = (deck: DeckSummary) => codes.get(deck.classId) ?? unknownClassCode;
  const shown = decks.slice(0, hubDeckLimit);
  const hasMore = decks.length > hubDeckLimit;

  return (
    <>
      {role === "teacher" ? (
        <TeacherRows decks={shown} codeFor={codeFor} />
      ) : (
        <DeckGrid decks={shown} eyebrowFor={codeFor} compact />
      )}
      {role === "student" || hasMore ? (
        <div className={styles.foot}>
          {role === "student" ? <p className={styles.totals}>{viewedTotalsLabel(decks)}</p> : null}
          {hasMore ? (
            <Link href="/classes" className={styles.more}>
              See all in your classes
            </Link>
          ) : null}
        </div>
      ) : null}
    </>
  );
}
