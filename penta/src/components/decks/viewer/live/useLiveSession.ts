import type { RealtimeChannel } from "@supabase/supabase-js";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { liveLimits } from "@/lib/config";
import {
  applyAnswer,
  countFollowers,
  liveLink,
  liveTopic,
  lookNeedsRead,
  pollDelay,
  toLiveState,
  type LiveLink,
  type LiveState,
  type LiveSync,
} from "@/lib/live";
import { createClient } from "@/lib/supabase/client";

export type LiveSessionOptions = { deckId: string; initial: LiveState; userId: string; isOwner: boolean };

export type LiveSession = {
  live: LiveState;
  link: LiveLink;
  lastReadAt: number;
  followers: number | null;
  read: () => Promise<void>;
  setFollowing: (following: boolean) => void;
};

let leaving: Promise<unknown> = Promise.resolve();

export function useLiveSession({ deckId, initial, userId, isOwner }: LiveSessionOptions): LiveSession {
  const supabase = useMemo(() => createClient(), []);
  const [sync, setSync] = useState<LiveSync>({ state: initial, appliedRequest: 0 });
  const [joined, setJoined] = useState(false);
  const [online, setOnline] = useState(true);
  const [followers, setFollowers] = useState<number | null>(null);
  const [clock, setClock] = useState(() => ({ lastReadAt: Date.now(), now: Date.now() }));
  const [rebuild, setRebuild] = useState(0);
  const requestNo = useRef(0);
  const revision = useRef(initial.revision);
  const following = useRef(false);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const presenceTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const running = sync.state.running;
  const connected = running && joined && online;

  useEffect(() => {
    revision.current = sync.state.revision;
  }, [sync]);

  const read = useCallback(async () => {
    requestNo.current += 1;
    const sent = requestNo.current;
    const { data, error } = await supabase.rpc("live_state", { target_deck: deckId });
    const answer = error ? null : toLiveState(data);
    if (!answer) return;
    const now = Date.now();
    setClock({ lastReadAt: now, now });
    setSync((held) => applyAnswer(held, sent, answer));
  }, [supabase, deckId]);

  useEffect(() => {
    if (!running) return;
    let stale = false;
    let channel: RealtimeChannel | null = null;
    let rejoin: ReturnType<typeof setTimeout> | undefined;

    void leaving.then(() => {
      if (stale) return;
      const created = supabase.channel(liveTopic(deckId), { config: { private: true, presence: { key: userId } } });
      channel = created;
      created.on("broadcast", { event: "look" }, ({ payload }) => {
        if (!lookNeedsRead(revision.current, (payload as { revision?: unknown } | null)?.revision)) return;
        setTimeout(() => void read(), Math.random() * liveLimits.lookJitterMilliseconds);
      });
      if (isOwner) {
        created.on("presence", { event: "sync" }, () => {
          setFollowers(countFollowers(created.presenceState(), userId));
        });
      }
      created.subscribe((status) => {
        if (stale) return;
        const up = status === "SUBSCRIBED";
        channelRef.current = up ? created : null;
        setJoined(up);
        if (!up) setFollowers(null);
        if (up) void read();
        if (up && following.current) void created.track({ following: true });
        if (status === "CLOSED") rejoin = setTimeout(() => setRebuild((count) => count + 1), liveLimits.rejoinMilliseconds);
      });
    });

    return () => {
      stale = true;
      clearTimeout(rejoin);
      channelRef.current = null;
      setJoined(false);
      setFollowers(null);
      if (channel) leaving = supabase.removeChannel(channel);
    };
  }, [supabase, deckId, userId, isOwner, running, rebuild, read]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const readIfVisible = () => {
      if (document.visibilityState === "visible") void read();
    };
    const tick = () => {
      readIfVisible();
      timer = setTimeout(tick, pollDelay({ running, connected }, Math.random()));
    };
    const goOnline = () => {
      setOnline(true);
      readIfVisible();
    };
    const goOffline = () => setOnline(false);

    timer = setTimeout(tick, pollDelay({ running, connected }, Math.random()));
    document.addEventListener("visibilitychange", readIfVisible);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", readIfVisible);
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, [running, connected, read]);

  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => setClock((held) => ({ ...held, now: Date.now() })), 5000);
    return () => clearInterval(timer);
  }, [running]);

  const setFollowing = useCallback((next: boolean) => {
    following.current = next;
    clearTimeout(presenceTimer.current);
    presenceTimer.current = setTimeout(() => {
      const channel = channelRef.current;
      if (!channel) return;
      void (following.current ? channel.track({ following: true }) : channel.untrack());
    }, liveLimits.presenceDebounceMilliseconds);
  }, []);

  useEffect(() => () => clearTimeout(presenceTimer.current), []);

  return {
    live: sync.state,
    link: liveLink({ connected, ...clock }),
    lastReadAt: clock.lastReadAt,
    followers: connected ? followers : null,
    read,
    setFollowing,
  };
}
