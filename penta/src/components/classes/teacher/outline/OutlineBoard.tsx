"use client";

import { useActionState } from "react";
import type { OutlineState } from "@/app/classes/routes-schema";
import type { ClassOutline } from "@/lib/routes";
import { OutlineList } from "./OutlineList";

export type OutlineAction = (previousState: OutlineState, formData: FormData) => Promise<OutlineState>;

const initialState: OutlineState = {};

export function OutlineBoard({ outline, action }: { outline: ClassOutline; action: OutlineAction }) {
  const [state, formAction, pending] = useActionState(action, initialState);

  return <OutlineList outline={outline} state={state} formAction={formAction} pending={pending} />;
}
