"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { quizLimits } from "@/lib/config";
import {
  nextNotice,
  noticeText,
  passedNotice,
  readClock,
  remainingMilliseconds,
  timeUpText,
  toMilliseconds,
  type ServerClock,
} from "./timer";

const tickMilliseconds = 250;

export type Countdown = {
  remaining: number | null;
  notice: string;
  sync: (serverNow: string | null, expiresAt: string | null) => void;
};

export function useCountdown(serverNow: string, expiresAt: string | null, onExpire: () => void): Countdown {
  const [remaining, setRemaining] = useState<number | null>(null);
  const [notice, setNotice] = useState("");
  const clock = useRef<ServerClock | null>(null);
  const deadline = useRef<number | null>(null);
  const spoken = useRef<number | null | undefined>(undefined);

  const sync = useCallback((now: string | null, expires: string | null) => {
    const read = now ? readClock(now, performance.now()) : null;
    if (read) clock.current = read;
    deadline.current = toMilliseconds(expires) ?? deadline.current;
  }, []);

  useEffect(() => {
    sync(serverNow, expiresAt);

    const tick = () => {
      if (!clock.current || deadline.current === null) return;
      const left = remainingMilliseconds(deadline.current, clock.current, performance.now());
      if (spoken.current === undefined) spoken.current = passedNotice(left, quizLimits.timerNoticesMinutes);
      const due = nextNotice(left, spoken.current, quizLimits.timerNoticesMinutes);
      if (due !== null) {
        spoken.current = due;
        setNotice(noticeText(due));
      }
      setRemaining(left);
      if (left > 0) return;
      setNotice(timeUpText);
      onExpire();
    };

    const first = setTimeout(tick, 0);
    const timer = setInterval(tick, tickMilliseconds);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, [serverNow, expiresAt, sync, onExpire]);

  return { remaining, notice, sync };
}
