import { useCallback, useEffect, useRef, useState } from "react";
import { slideLimits } from "@/lib/config";
import {
  createSaveState,
  nextSave,
  retryDelay,
  saveIndicator,
  saveReducer,
  type SaveAnswer,
  type SaveEvent,
  type SaveIndicator,
  type SaveState,
} from "@/lib/slides/autosave";
import { contentBytes, type DeckContent } from "@/lib/slides/schema";

export type SaveInput = { deckId: string; knownVersion: number; saveId: string; content: DeckContent };

export type SaveDeck = (input: SaveInput) => Promise<SaveAnswer>;

export type AutosaveOptions = {
  deckId: string;
  content: DeckContent;
  initialVersion: number;
  save: SaveDeck;
};

export type Autosave = {
  indicator: SaveIndicator;
  liveSessionId: string | null;
  flush: () => Promise<boolean>;
  keepMine: () => void;
  resume: () => void;
};

const failed: SaveAnswer = { status: "failed" };

function withTimeout(answer: Promise<SaveAnswer>): Promise<SaveAnswer> {
  const late = new Promise<SaveAnswer>((resolve) => setTimeout(() => resolve(failed), slideLimits.saveTimeoutMilliseconds));
  return Promise.race([answer, late]).catch(() => failed);
}

export function useAutosave({ deckId, content, initialVersion, save }: AutosaveOptions): Autosave {
  const [state, setState] = useState<SaveState>(() => createSaveState(content, initialVersion));
  const held = useRef(state);
  const current = useRef(content);
  const editedAt = useRef(0);
  const running = useRef<Promise<boolean> | null>(null);

  const apply = useCallback((event: SaveEvent) => {
    held.current = saveReducer(held.current, event);
    setState(held.current);
  }, []);

  const sendOnce = useCallback(async (): Promise<boolean> => {
    const pending = nextSave(held.current, current.current, () => crypto.randomUUID());
    if (!pending) return false;
    apply({ type: "sent", pending });
    const tooLarge = contentBytes(pending.content) > slideLimits.contentMaxBytes;
    const answer: SaveAnswer = tooLarge
      ? { status: "too_large" }
      : await withTimeout(save({ deckId, knownVersion: held.current.version, saveId: pending.saveId, content: pending.content }));
    apply({ type: "answered", answer });
    return answer.status === "saved";
  }, [apply, deckId, save]);

  const send = useCallback((): Promise<boolean> => {
    if (running.current) return running.current;
    const work = sendOnce().finally(() => {
      running.current = null;
    });
    running.current = work;
    return work;
  }, [sendOnce]);

  const flush = useCallback(async (): Promise<boolean> => {
    if (running.current) await running.current;
    while (await send()) continue;
    return saveIndicator(held.current, current.current) === "saved";
  }, [send]);

  useEffect(() => {
    if (current.current === content) return;
    current.current = content;
    editedAt.current = Date.now();
    apply({ type: "edited" });
  }, [content, apply]);

  useEffect(() => {
    if (!nextSave(state, content, () => "")) return;
    const sinceEdit = Date.now() - editedAt.current;
    const delay = state.retry ? retryDelay(state.failures) : Math.max(0, slideLimits.saveDelayMilliseconds - sinceEdit);
    const timer = setTimeout(() => void send(), delay);
    return () => clearTimeout(timer);
  }, [state, content, send]);

  useEffect(() => {
    const retryNow = () => {
      if (held.current.retry) void send();
    };
    const saveWhenHidden = () => {
      if (document.visibilityState === "hidden") void flush();
    };
    const warn = (event: BeforeUnloadEvent) => {
      if (saveIndicator(held.current, current.current) !== "saved") event.preventDefault();
    };
    window.addEventListener("online", retryNow);
    document.addEventListener("visibilitychange", saveWhenHidden);
    window.addEventListener("beforeunload", warn);
    return () => {
      window.removeEventListener("online", retryNow);
      document.removeEventListener("visibilitychange", saveWhenHidden);
      window.removeEventListener("beforeunload", warn);
      void flush();
    };
  }, [send, flush]);

  return {
    indicator: saveIndicator(state, content),
    liveSessionId: state.liveSessionId,
    flush,
    keepMine: useCallback(() => apply({ type: "keepMine" }), [apply]),
    resume: useCallback(() => apply({ type: "resume" }), [apply]),
  };
}
