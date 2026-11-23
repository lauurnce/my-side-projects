"use client";

import type { CurrentUser } from "@/lib/auth";
import type { OpenThread } from "@/lib/threads";
import { useThreadLive } from "./useThreadLive";

export type ThreadScreenProps = { user: CurrentUser; initial: OpenThread };

export function ThreadScreen({ initial }: ThreadScreenProps) {
  const { view } = useThreadLive(initial);
  return <h1>{view?.thread.title}</h1>;
}
