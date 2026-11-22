import Link from "next/link";
import { StatusChip } from "@/components/ui/StatusChip";
import type { Role } from "@/lib/auth";
import { deckFormat, type DeckSummary } from "@/lib/decks";
import { DeckGrid } from "./DeckGrid";
import {
  classCodes,
  deckHref,
  hubDeckLimit,
  liveFirst,
  slideCountLabel,
  unknownClassCode,
  viewedTotalsLabel,
} from "./helpers";
import styles from "./library.module.css";

export type HubDeckListProps = {
  role: Role;
  decks: DeckSummary[];
  classes: { id: string; code: string }[];
  liveIds?: ReadonlySet<string>;
};

type TeacherRowsProps = {
  decks: DeckSummary[];
  codeFor: (deck: DeckSummary) => string;
  liveIds: ReadonlySet<string>;
};

const noLiveIds: ReadonlySet<string> = new Set();

function TeacherRows({ decks, codeFor, liveIds }: TeacherRowsProps) {
  return (
    <ul className={styles.rows}>
      {decks.map((deck) => (
        <li key={deck.id} className={styles.cell}>
          <a className={styles.row} href={deckHref(deck.id)}>
            <span className={styles.rowTitle}>{deck.title}</span>
            {liveIds.has(deck.id) ? (
              <span className={styles.rowLive}>
                <StatusChip status="live">Live</StatusChip>
              </span>
            ) : null}
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

export function HubDeckList({ role, decks, classes, liveIds = noLiveIds }: HubDeckListProps) {
  const codes = classCodes(classes);
  const codeFor = (deck: DeckSummary) => codes.get(deck.classId) ?? unknownClassCode;
  const shown = liveFirst(decks, liveIds).slice(0, hubDeckLimit);
  const hasMore = decks.length > hubDeckLimit;

  return (
    <>
      {role === "teacher" ? (
        <TeacherRows decks={shown} codeFor={codeFor} liveIds={liveIds} />
      ) : (
        <DeckGrid decks={shown} eyebrowFor={codeFor} compact liveIds={liveIds} />
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
