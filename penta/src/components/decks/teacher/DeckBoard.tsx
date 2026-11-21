"use client";

import { useActionState } from "react";
import type { DeckActionState } from "@/app/decks/upload-schema";
import type { DeckSummary } from "@/lib/decks";
import { DeckList } from "./DeckList";
import type { LessonGroup } from "./labels";

export type DeckAction = (previousState: DeckActionState, formData: FormData) => Promise<DeckActionState>;

export type DeckBoardProps = {
  decks: DeckSummary[];
  lessons: LessonGroup[];
  action: DeckAction;
};

const initialState: DeckActionState = {};

export function DeckBoard({ decks, lessons, action }: DeckBoardProps) {
  const [state, formAction, pending] = useActionState(action, initialState);

  return <DeckList decks={decks} lessons={lessons} state={state} formAction={formAction} pending={pending} />;
}
