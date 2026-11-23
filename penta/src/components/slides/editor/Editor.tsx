"use client";

import Link from "next/link";
import { useCallback, useReducer } from "react";
import { BracketLabel } from "@/components/ui/BracketLabel";
import { canRedo, canUndo, createEditorState, editorReducer } from "@/lib/slides/editor";
import type { DeckContent } from "@/lib/slides/schema";
import { Canvas } from "./Canvas";
import { SlideList } from "./SlideList";
import { Toolbar } from "./Toolbar";
import styles from "./editor.module.css";

export type EditorDeck = { id: string; title: string; classId: string; published: boolean };

export type EditorProps = {
  deck: EditorDeck;
  initialContent: DeckContent;
  initialVersion: number;
};

export function Editor({ deck, initialContent }: EditorProps) {
  const [state, dispatch] = useReducer(editorReducer, initialContent, createEditorState);
  const imageBase = `/decks/${deck.id}/images/`;
  const slide = state.content.slides[state.selectedSlide] ?? state.content.slides[0];
  const selectedBlock = slide.blocks.find((block) => block.id === state.selectedBlock) ?? null;
  const pickImage = useCallback(async () => null, []);

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <Link className={styles.back} href={`/classes/${deck.classId}`}>
          Back to the class
        </Link>
        <p className={styles.labels}>
          <BracketLabel>Layer 02 · Decks</BracketLabel>
          <BracketLabel>Editor</BracketLabel>
        </p>
        <h1 className={styles.title}>{deck.title}</h1>
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
      </div>
    </div>
  );
}
