import type { RealtimeChannel } from "@supabase/supabase-js";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { threadLimits } from "@/lib/config";
import { createClient } from "@/lib/supabase/client";
import { loadThreadView, type OpenThread } from "@/lib/threads";
import { applyThreadAnswer, lookDelay, threadPollDelay, threadTopic, type ThreadSync } from "./live/thread-sync";

export type ThreadLink = "live" | "catching_up";

export type ThreadLive = {
  view: OpenThread | null;
  link: ThreadLink;
  refresh: () => Promise<void>;
};

let leaving: Promise<unknown> = Promise.resolve();

function watchVisibility(notify: () => void) {
  document.addEventListener("visibilitychange", notify);
  return () => document.removeEventListener("visibilitychange", notify);
}

function tabIsVisible() {
  return document.visibilityState === "visible";
}

function serverIsNeverVisible() {
  return false;
}

export function useThreadLive(initial: OpenThread): ThreadLive {
  const supabase = useMemo(() => createClient(), []);
  const threadId = initial.thread.id;
  const [sync, setSync] = useState<ThreadSync>(() => ({ view: initial, appliedRequest: 0 }));
  const [joined, setJoined] = useState(false);
  const [online, setOnline] = useState(true);
  const [rebuild, setRebuild] = useState(0);
  const visible = useSyncExternalStore(watchVisibility, tabIsVisible, serverIsNeverVisible);
  const held = useRef(sync);
  const requestNo = useRef(0);

  const available = sync.view !== null;
  const connected = joined && online;

  const refresh = useCallback(async () => {
    requestNo.current += 1;
    const sent = requestNo.current;
    const answer = await loadThreadView(supabase, threadId, held.current.view?.version).catch(() => null);
    const next = applyThreadAnswer(held.current, sent, answer);
    if (next === held.current) return;
    held.current = next;
    setSync(next);
  }, [supabase, threadId]);

  useEffect(() => {
    if (!available || !visible) return;
    let stale = false;
    let channel: RealtimeChannel | null = null;
    let rejoin: ReturnType<typeof setTimeout> | undefined;
    let look: ReturnType<typeof setTimeout> | undefined;

    const readAfterLook = () => {
      look = undefined;
      void refresh();
    };

    void leaving.then(() => {
      if (stale) return;
      const created = supabase.channel(threadTopic(threadId), { config: { private: true } });
      channel = created;
      created.on("broadcast", { event: "look" }, () => {
        if (stale || look !== undefined) return;
        look = setTimeout(readAfterLook, lookDelay(Math.random()));
      });
      created.subscribe((status) => {
        if (stale) return;
        const up = status === "SUBSCRIBED";
        setJoined(up);
        if (up) void refresh();
        if (status !== "CLOSED") return;
        clearTimeout(rejoin);
        rejoin = setTimeout(() => setRebuild((count) => count + 1), threadLimits.rejoinMilliseconds);
      });
    });

    return () => {
      stale = true;
      clearTimeout(rejoin);
      clearTimeout(look);
      setJoined(false);
      if (channel) leaving = supabase.removeChannel(channel).catch(() => undefined);
    };
  }, [supabase, threadId, available, visible, rebuild, refresh]);

  useEffect(() => {
    if (!visible) return;
    let timer: ReturnType<typeof setTimeout>;
    const wait = () => threadPollDelay({ available, connected }, Math.random());
    const tick = () => {
      void refresh();
      timer = setTimeout(tick, wait());
    };
    timer = setTimeout(tick, wait());
    return () => clearTimeout(timer);
  }, [visible, available, connected, refresh]);

  useEffect(() => {
    const readIfVisible = () => {
      if (tabIsVisible()) void refresh();
    };
    const goOnline = () => {
      setOnline(true);
      readIfVisible();
    };
    const goOffline = () => setOnline(false);

    document.addEventListener("visibilitychange", readIfVisible);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      document.removeEventListener("visibilitychange", readIfVisible);
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, [refresh]);

  return { view: sync.view, link: connected ? "live" : "catching_up", refresh };
}
