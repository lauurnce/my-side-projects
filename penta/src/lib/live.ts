import type { SupabaseClient } from "@supabase/supabase-js";
import { liveLimits } from "@/lib/config";
import type { Database } from "@/lib/database.types";

export type LiveState = { sessionId: string | null; slide: number; revision: number; running: boolean };

export type LiveSync = { state: LiveState; appliedRequest: number };

export type LiveLink = "live" | "catching_up" | "out_of_touch";

export type FollowState = { wanted: number; following: boolean; joined: boolean };

export type FollowAction =
  | { type: "join"; slide: number }
  | { type: "browse" }
  | { type: "move"; slide: number }
  | { type: "live"; live: LiveState };

export type LiveDeck = { deckId: string; classId: string; sessionId: string; slide: number };

export const noLive: LiveState = { sessionId: null, slide: 1, revision: 0, running: false };

export function liveTopic(deckId: string): string {
  return `live:${deckId}`;
}

export function toLiveState(value: unknown): LiveState | null {
  if (typeof value !== "object" || value === null) return null;
  const { session_id, current_slide, revision, running } = value as Record<string, unknown>;
  if (typeof revision !== "number" || typeof running !== "boolean") return null;
  if (session_id === null) return { ...noLive, revision };
  if (typeof session_id !== "string" || typeof current_slide !== "number") return null;
  return { sessionId: session_id, slide: current_slide, revision, running };
}

export function applyAnswer(sync: LiveSync, requestNo: number, answer: LiveState): LiveSync {
  if (requestNo <= sync.appliedRequest || answer.revision < sync.state.revision) return sync;
  return { state: answer, appliedRequest: requestNo };
}

export function lookNeedsRead(heldRevision: number, eventRevision: unknown): boolean {
  return typeof eventRevision !== "number" || eventRevision >= heldRevision;
}

export function liveLink(input: { connected: boolean; lastReadAt: number; now: number }): LiveLink {
  if (input.now - input.lastReadAt > liveLimits.outOfTouchMilliseconds) return "out_of_touch";
  return input.connected ? "live" : "catching_up";
}

export function pollDelay(input: { running: boolean; connected: boolean }, random: number): number {
  const base = !input.running
    ? liveLimits.pollIdleMilliseconds
    : input.connected
      ? liveLimits.pollUpMilliseconds
      : liveLimits.pollDownMilliseconds;
  return Math.round(base * (1 + (random * 2 - 1) * liveLimits.pollJitterRatio));
}

export function followReducer(state: FollowState, action: FollowAction): FollowState {
  if (action.type === "join") return { wanted: action.slide, following: true, joined: true };
  if (action.type === "browse") return { ...state, following: false };
  if (action.type === "move") return { ...state, wanted: action.slide, following: false };
  if (!action.live.running) return state.following || state.joined ? { ...state, following: false, joined: false } : state;
  if (!state.following || state.wanted === action.live.slide) return state;
  return { ...state, wanted: action.live.slide };
}

export function countFollowers(presence: Record<string, unknown[]>, ownKey: string): number {
  return Object.entries(presence).filter(
    ([key, entries]) =>
      key !== ownKey && entries.some((entry) => (entry as { following?: unknown } | null)?.following === true),
  ).length;
}

export async function loadLiveDecks(supabase: SupabaseClient<Database>): Promise<LiveDeck[]> {
  const { data } = await supabase.rpc("live_now");
  return (data ?? []).map((row) => ({
    deckId: row.deck_id,
    classId: row.class_id,
    sessionId: row.session_id,
    slide: row.current_slide,
  }));
}

export async function loadLiveState(supabase: SupabaseClient<Database>, deckId: string): Promise<LiveState> {
  const { data } = await supabase.rpc("live_state", { target_deck: deckId });
  return toLiveState(data) ?? noLive;
}
