import Link from "next/link";
import type { DeckActionState, DeckIntent } from "@/app/decks/upload-schema";
import { StatusChip } from "@/components/ui/StatusChip";
import teacherStyles from "@/components/classes/teacher/teacher.module.css";
import type { DeckSummary } from "@/lib/decks";
import styles from "./decks.module.css";
import {
  deckDownloadPath,
  deckMeta,
  deckPath,
  draftLessonNote,
  emptyDecksMessage,
  isLinkedToDraft,
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
  state: DeckActionState;
};

function DeckFields({ intent, deckId }: { intent: DeckIntent; deckId: string }) {
  return (
    <>
      <input type="hidden" name="intent" value={intent} />
      <input type="hidden" name="deckId" value={deckId} />
    </>
  );
}

function DeckRow({ deck, lessons, formAction, pending }: Controls & { deck: DeckSummary; lessons: LessonGroup[] }) {
  return (
    <li className={styles.deck}>
      <div className={styles.deckInfo}>
        {deck.ready ? (
          <Link className={styles.deckTitle} href={deckPath(deck.id)}>
            {deck.title}
          </Link>
        ) : (
          <p className={styles.deckTitle}>{deck.title}</p>
        )}
        <div className={styles.metaRow}>
          {!deck.ready && <StatusChip status="due">Not finished</StatusChip>}
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
          {deck.ready && (
            <a className={styles.button} href={deckDownloadPath(deck.id)} aria-label={`Download ${deck.title}`}>
              Download
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

export function DeckList({ decks, lessons, state, formAction, pending }: DeckListProps) {
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
            <DeckRow key={deck.id} deck={deck} lessons={lessons} formAction={formAction} pending={pending} />
          ))}
        </ul>
      )}
    </>
  );
}
