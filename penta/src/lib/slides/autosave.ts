import { slideLimits } from "@/lib/config";
import type { DeckContent } from "./schema";

export type SaveAnswer =
  | { status: "saved"; version: number }
  | { status: "conflict"; version: number }
  | { status: "live"; sessionId: string }
  | { status: "signed_out" | "too_large" | "missing_image" | "refused" | "failed" };

export type SaveHalt = "conflict" | "live" | "too_large" | "missing_image" | "refused";

export type PendingSave = { content: DeckContent; saveId: string };

export type SaveState = {
  version: number;
  saved: DeckContent;
  sending: PendingSave | null;
  retry: PendingSave | null;
  failures: number;
  signedOut: boolean;
  halt: SaveHalt | null;
  remoteVersion: number | null;
  liveSessionId: string | null;
};

export type SaveEvent =
  | { type: "sent"; pending: PendingSave }
  | { type: "answered"; answer: SaveAnswer }
  | { type: "edited" }
  | { type: "keepMine" }
  | { type: "resume" };

export type SaveIndicator = "saved" | "unsaved" | "saving" | "not_saved" | "signed_out" | SaveHalt;

const clearedByEditing: SaveHalt[] = ["too_large", "missing_image", "refused"];

export function createSaveState(content: DeckContent, version: number): SaveState {
  return {
    version,
    saved: content,
    sending: null,
    retry: null,
    failures: 0,
    signedOut: false,
    halt: null,
    remoteVersion: null,
    liveSessionId: null,
  };
}

function answered(state: SaveState, answer: SaveAnswer): SaveState {
  const sent = state.sending;
  if (!sent) return state;
  const idle = { ...state, sending: null, retry: null };
  if (answer.status === "saved") {
    return { ...idle, version: answer.version, saved: sent.content, failures: 0, signedOut: false, halt: null };
  }
  if (answer.status === "conflict") return { ...idle, halt: "conflict", remoteVersion: answer.version };
  if (answer.status === "live") return { ...idle, halt: "live", liveSessionId: answer.sessionId };
  if (answer.status === "failed" || answer.status === "signed_out") {
    return { ...idle, retry: sent, failures: state.failures + 1, signedOut: answer.status === "signed_out" };
  }
  return { ...idle, halt: answer.status };
}

export function saveReducer(state: SaveState, event: SaveEvent): SaveState {
  if (event.type === "sent") return state.sending ? state : { ...state, sending: event.pending };
  if (event.type === "answered") return answered(state, event.answer);
  if (event.type === "edited") {
    return state.halt && clearedByEditing.includes(state.halt) ? { ...state, halt: null } : state;
  }
  if (event.type === "keepMine") {
    if (state.halt !== "conflict" || state.remoteVersion === null) return state;
    return { ...state, halt: null, version: state.remoteVersion, remoteVersion: null };
  }
  return state.halt === "live" ? { ...state, halt: null, liveSessionId: null } : state;
}

export function nextSave(state: SaveState, current: DeckContent, makeId: () => string): PendingSave | null {
  if (state.sending || state.halt) return null;
  if (state.retry) return state.retry;
  return current === state.saved ? null : { content: current, saveId: makeId() };
}

export function retryDelay(failures: number): number {
  const steps = slideLimits.saveRetryMilliseconds;
  return failures < 1 ? 0 : steps[Math.min(failures, steps.length) - 1];
}

export function saveIndicator(state: SaveState, current: DeckContent): SaveIndicator {
  if (state.halt) return state.halt;
  if (state.sending) return "saving";
  if (state.signedOut) return "signed_out";
  if (state.retry) return "not_saved";
  return current === state.saved ? "saved" : "unsaved";
}

export const saveIndicatorLabels: Record<SaveIndicator, string> = {
  saved: "Saved",
  unsaved: "Not saved yet",
  saving: "Saving",
  not_saved: "Not saved. Trying again.",
  signed_out: "Not saved. Sign in again in another tab.",
  conflict: "This deck changed elsewhere.",
  live: "This deck is live. End the session to save.",
  too_large: "Not saved. This deck is too large. Remove some text.",
  missing_image: "Not saved. An image is missing. Remove it and add it again.",
  refused: "Not saved. This deck can no longer be saved here.",
};
