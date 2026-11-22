import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { liveLimits } from "@/lib/config";
import type { LiveState } from "@/lib/live";
import { createMoveQueue, type MoveQueue, type MoveResult } from "@/lib/move-queue";
import { createClient } from "@/lib/supabase/client";

export type PresenterOptions = {
  deckId: string;
  enabled: boolean;
  live: LiveState;
  slide: number;
  read: () => Promise<void>;
  adopt: (slide: number) => void;
};

export type Presenter = {
  presenting: boolean;
  busy: boolean;
  unsent: boolean;
  present: () => void;
  end: () => void;
  move: (slide: number) => void;
};

function toMoveResult(data: unknown, fallbackRevision: number): MoveResult {
  const { status, revision } = (data ?? {}) as { status?: unknown; revision?: unknown };
  if (status === "moved" && typeof revision === "number") return { status: "moved", revision };
  if (status === "bad_slide") return { status: "moved", revision: fallbackRevision };
  if (status === "ended" || status === "refused") return { status: "ended" };
  return { status: "failed" };
}

export function usePresenter({ deckId, enabled, live, slide, read, adopt }: PresenterOptions): Presenter {
  const supabase = useMemo(() => createClient(), []);
  const [busy, setBusy] = useState(false);
  const [unsent, setUnsent] = useState(false);
  const session = useRef(live.sessionId);
  const ownRevision = useRef(0);
  const queue = useRef<MoveQueue | null>(null);
  const presenting = enabled && live.running && live.sessionId !== null;

  useEffect(() => {
    session.current = live.running ? live.sessionId : null;
  }, [live]);

  useEffect(() => {
    const created = createMoveQueue({
      send: async (target) => {
        const id = session.current;
        if (!id) return { status: "ended" };
        const { data, error } = await supabase
          .rpc("move_live", { target_session: id, slide: target })
          .abortSignal(AbortSignal.timeout(liveLimits.moveTimeoutMilliseconds));
        return error ? { status: "failed" } : toMoveResult(data, ownRevision.current);
      },
      onSent: (_slide, revision) => {
        ownRevision.current = Math.max(ownRevision.current, revision);
      },
      onEnded: () => void read(),
      onUnsent: setUnsent,
    });
    queue.current = created;
    return () => {
      created.stop();
      queue.current = null;
    };
  }, [supabase, read]);

  useEffect(() => {
    if (!presenting || live.revision <= ownRevision.current || live.slide === slide) return;
    if (queue.current && !queue.current.idle()) return;
    ownRevision.current = live.revision;
    adopt(live.slide);
  }, [presenting, live, slide, adopt]);

  useEffect(() => {
    if (!presenting) return;
    const timer = setInterval(async () => {
      const id = session.current;
      if (!id) return;
      const { data } = await supabase.rpc("touch_live", { target_session: id });
      if (data !== "open") void read();
    }, liveLimits.heartbeatMilliseconds);
    return () => clearInterval(timer);
  }, [supabase, presenting, read]);

  const present = useCallback(() => {
    if (!enabled || busy) return;
    setBusy(true);
    void Promise.resolve(supabase.rpc("start_live", { target_deck: deckId, slide }))
      .then(() => read())
      .finally(() => setBusy(false));
  }, [supabase, enabled, busy, deckId, slide, read]);

  const end = useCallback(() => {
    const id = session.current;
    if (!id || busy) return;
    setBusy(true);
    void Promise.resolve(supabase.rpc("end_live", { target_session: id }))
      .then(() => read())
      .finally(() => setBusy(false));
  }, [supabase, busy, read]);

  const move = useCallback(
    (target: number) => {
      if (presenting) queue.current?.push(target);
    },
    [presenting],
  );

  return { presenting, busy, unsent: presenting && unsent, present, end, move };
}
