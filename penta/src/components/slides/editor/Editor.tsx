"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useReducer, useState, type MouseEvent } from "react";
import { SlideRenderer } from "@/components/slides/SlideRenderer";
import { BracketLabel } from "@/components/ui/BracketLabel";
import { saveIndicatorLabels } from "@/lib/slides/autosave";
import { canRedo, canUndo, createEditorState, editorReducer } from "@/lib/slides/editor";
import { sendSlideImage } from "@/lib/slides/image-send";
import type { DeckContent } from "@/lib/slides/schema";
import { createClient } from "@/lib/supabase/client";
import { Canvas } from "./Canvas";
import { SlideList } from "./SlideList";
import { Toolbar } from "./Toolbar";
import { useAutosave, type SaveDeck } from "./useAutosave";
import styles from "./editor.module.css";

export type EditorDeck = { id: string; title: string; classId: string; published: boolean; viewed: boolean };

export type PublishDeck = (input: { deckId: string }) => Promise<{ tone?: "status" | "alert"; message?: string }>;

export type EditorProps = {
  deck: EditorDeck;
  initialContent: DeckContent;
  initialVersion: number;
  save: SaveDeck;
  publish: PublishDeck;
};

const previewWidth = 350;

export function Editor({ deck, initialContent, initialVersion, save, publish }: EditorProps) {
  const router = useRouter();
  const [state, dispatch] = useReducer(editorReducer, initialContent, createEditorState);
  const [published, setPublished] = useState(deck.published);
  const [notice, setNotice] = useState<{ tone: "status" | "alert"; message: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const autosave = useAutosave({ deckId: deck.id, content: state.content, initialVersion, save });
  const { flush, resume, liveSessionId } = autosave;
  const imageBase = `/decks/${deck.id}/images/`;
  const slide = state.content.slides[state.selectedSlide] ?? state.content.slides[0];
  const selectedBlock = slide.blocks.find((block) => block.id === state.selectedBlock) ?? null;

  const pickImage = useCallback(
    async (file: File) => {
      const sent = await sendSlideImage(deck.id, file);
      if ("file" in sent) {
        setNotice(null);
        return sent.file;
      }
      setNotice({ tone: "alert", message: sent.message });
      return null;
    },
    [deck.id],
  );

  const leaveTo = (href: string) => async (event: MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    await flush();
    router.push(href);
  };

  const publishNow = async () => {
    setBusy(true);
    await flush();
    const answer = await publish({ deckId: deck.id }).catch(() => ({ tone: "alert" as const, message: "Something went wrong. Try again." }));
    setBusy(false);
    if (answer.tone === "status") setPublished(true);
    if (answer.message) setNotice({ tone: answer.tone ?? "alert", message: answer.message });
  };

  const endLive = async () => {
    if (!liveSessionId) return;
    setBusy(true);
    await createClient().rpc("end_live", { target_session: liveSessionId });
    setBusy(false);
    resume();
  };

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <Link className={styles.back} href={`/classes/${deck.classId}`} onClick={leaveTo(`/classes/${deck.classId}`)}>
          Back to the class
        </Link>
        <p className={styles.labels}>
          <BracketLabel>Layer 02 · Decks</BracketLabel>
          <BracketLabel>Editor</BracketLabel>
          <BracketLabel>{published ? "Published" : "Draft"}</BracketLabel>
        </p>
        <h1 className={styles.title}>{deck.title}</h1>
        <div className={styles.bar}>
          <p className={styles.saved} role="status" aria-live="polite" data-state={autosave.indicator}>
            {saveIndicatorLabels[autosave.indicator]}
          </p>
          {autosave.indicator === "conflict" && (
            <>
              <button type="button" className={styles.button} onClick={autosave.keepMine}>
                Keep mine
              </button>
              <button type="button" className={styles.button} onClick={() => window.location.reload()}>
                Reload
              </button>
            </>
          )}
          {autosave.indicator === "live" && (
            <button type="button" className={styles.button} onClick={endLive} disabled={busy}>
              End session and save
            </button>
          )}
          {published ? (
            <Link className={styles.button} href={`/decks/${deck.id}`} onClick={leaveTo(`/decks/${deck.id}`)}>
              Present
            </Link>
          ) : (
            <button type="button" className={styles.button} onClick={publishNow} disabled={busy}>
              Publish
            </button>
          )}
          <Link className={styles.button} href={`/decks/${deck.id}/print`} onClick={leaveTo(`/decks/${deck.id}/print`)}>
            Export PDF
          </Link>
        </div>
        <p className={styles.note}>
          {published
            ? "Students in this class can see this deck. Changes show as you save."
            : "Only you can see this deck. Publish it to show it to the class and present it."}
          {deck.viewed && " Students have viewed this deck. Adding slides asks them to view the new ones."}
        </p>
        {notice && (
          <p className={styles.notice} role={notice.tone === "status" ? "status" : "alert"}>
            {notice.message}
          </p>
        )}
      </header>
      <div className={styles.workspace}>
        <SlideList content={state.content} selectedSlide={state.selectedSlide} imageBase={imageBase} dispatch={dispatch} />
        <div className={styles.stage}>
          <Toolbar
            slide={slide}
            selectedBlock={selectedBlock}
            canUndo={canUndo(state)}
            canRedo={canRedo(state)}
            dispatch={dispatch}
            onPickImage={pickImage}
          />
          <Canvas slide={slide} selectedBlock={state.selectedBlock} imageBase={imageBase} dispatch={dispatch} />
        </div>
        <div className={styles.preview}>
          <p className={styles.note}>Open this deck on a larger screen to edit it.</p>
          <SlideRenderer slide={slide} imageBase={imageBase} width={previewWidth} />
        </div>
      </div>
    </div>
  );
}
