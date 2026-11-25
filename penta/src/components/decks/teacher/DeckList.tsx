import Link from "next/link";
import type { DeckActionState, DeckIntent } from "@/app/decks/upload-schema";
import { StatusChip } from "@/components/ui/StatusChip";
import teacherStyles from "@/components/classes/teacher/teacher.module.css";
import type { DeckSummary } from "@/lib/decks";
import styles from "./decks.module.css";
import {
  deckDownloadPath,
  deckEditPath,
  deckMeta,
  deckPath,
  draftLessonNote,
  emptyDecksMessage,
  downloadLabel,
  isLinkedToDraft,
  unreadyLabel,
  type LessonGroup,
} from "./labels";
import { LessonSelect } from "./LessonSelect";

type Controls = {
  formAction: (formData: FormData) => void;
  pending: boolean;
};

export type DeckListProps = Controls & {
  decks: DeckSummary[];
  lessons: LessonGroup[];
  liveDeckIds?: string[];
  state: DeckActionState;
};

type DeckRowProps = Controls & {
  deck: DeckSummary;
  lessons: LessonGroup[];
  live: boolean;
};

function DeckFields({ intent, deckId }: { intent: DeckIntent; deckId: string }) {
  return (
    <>
      <input type="hidden" name="intent" value={intent} />
      <input type="hidden" name="deckId" value={deckId} />
    </>
  );
}

function DeckRow({ deck, lessons, live, formAction, pending }: DeckRowProps) {
  return (
    <li className={styles.deck}>
      <div className={styles.deckInfo}>
        <div className={styles.titleRow}>
          {deck.ready ? (
            <Link className={styles.deckTitle} href={deckPath(deck.id)}>
              {deck.title}
            </Link>
          ) : (
            <p className={styles.deckTitle}>{deck.title}</p>
          )}
          {live && <StatusChip status="live">Live</StatusChip>}
        </div>
        <div className={styles.metaRow}>
          {!deck.ready && <StatusChip status="due">{unreadyLabel(deck)}</StatusChip>}
          <p className={styles.meta}>{deckMeta(deck)}</p>
        </div>
        {isLinkedToDraft(deck, lessons) && <p className={styles.draftNote}>{draftLessonNote}</p>}
      </div>
      <div className={styles.deckControls}>
        <form action={formAction} className={styles.linkForm}>
          <DeckFields intent="setDeckLesson" deckId={deck.id} />
          <div className={styles.linkField}>
            <LessonSelect
              key={deck.lessonId ?? ""}
              groups={lessons}
              defaultValue={deck.lessonId ?? ""}
              spokenLabel={`Lesson for ${deck.title}`}
            />
          </div>
          <button
            type="submit"
            className={styles.button}
            aria-label={`Save lesson for ${deck.title}`}
            disabled={pending}
          >
            Save
          </button>
        </form>
        <div className={styles.actions}>
          {deck.kind === "native" && (
            <Link className={styles.button} href={deckEditPath(deck.id)} aria-label={`Edit ${deck.title}`}>
              Edit
            </Link>
          )}
          {deck.ready && (
            <a className={styles.button} href={deckDownloadPath(deck.id)} aria-label={`${downloadLabel(deck)} ${deck.title}`}>
              {downloadLabel(deck)}
            </a>
          )}
          <form action={formAction}>
            <DeckFields intent="deleteDeck" deckId={deck.id} />
            <button
              type="submit"
              className={styles.button}
              aria-label={`Delete deck ${deck.title}`}
              disabled={pending}
            >
              Delete
            </button>
          </form>
        </div>
      </div>
    </li>
  );
}

export function DeckList({ decks, lessons, liveDeckIds = [], state, formAction, pending }: DeckListProps) {
  return (
    <>
      {state.message && (
        <p role={state.tone === "status" ? "status" : "alert"} className={teacherStyles.notice}>
          {state.message}
        </p>
      )}
      {decks.length === 0 ? (
        <p className={teacherStyles.empty}>{emptyDecksMessage}</p>
      ) : (
        <ul className={styles.list} aria-label="Decks in this class">
          {decks.map((deck) => (
            <DeckRow
              key={deck.id}
              deck={deck}
              lessons={lessons}
              live={liveDeckIds.includes(deck.id)}
              formAction={formAction}
              pending={pending}
            />
          ))}
        </ul>
      )}
    </>
  );
}
