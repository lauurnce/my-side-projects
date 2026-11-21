import { useEffect, useRef, useState } from "react";
import { deckLimits } from "@/lib/config";

export type SeenSlidesOptions = {
  enabled: boolean;
  initial: number[];
  slide: number;
  painted: boolean;
  limit: number;
  record: (slideNo: number) => Promise<boolean>;
};

export function useSeenSlides({ enabled, initial, slide, painted, limit, record }: SeenSlidesOptions): Set<number> {
  const [seen, setSeen] = useState(() => new Set(initial));
  const sending = useRef(new Set<number>());

  useEffect(() => {
    if (!enabled || !painted || slide < 1 || slide > limit || seen.has(slide)) return;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const send = () => {
      if (sending.current.has(slide)) return;
      sending.current.add(slide);
      record(slide)
        .catch(() => false)
        .then((ok) => {
          sending.current.delete(slide);
          if (ok) setSeen((previous) => new Set(previous).add(slide));
        });
    };

    const restart = () => {
      clearTimeout(timer);
      if (document.visibilityState !== "visible") return;
      timer = setTimeout(send, deckLimits.seenAfterMilliseconds);
    };

    restart();
    document.addEventListener("visibilitychange", restart);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", restart);
    };
  }, [enabled, painted, slide, limit, seen, record]);

  return seen;
}
