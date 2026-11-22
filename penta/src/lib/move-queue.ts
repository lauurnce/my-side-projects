import { liveLimits } from "@/lib/config";

export type MoveResult = { status: "moved"; revision: number } | { status: "ended" } | { status: "failed" };

export type MoveQueueOptions = {
  send: (slide: number) => Promise<MoveResult>;
  onSent: (slide: number, revision: number) => void;
  onEnded: () => void;
  onUnsent: (unsent: boolean) => void;
};

export type MoveQueue = { push: (slide: number) => void; idle: () => boolean; stop: () => void };

export function createMoveQueue({ send, onSent, onEnded, onUnsent }: MoveQueueOptions): MoveQueue {
  let target: number | null = null;
  let busy = false;
  let stopped = false;
  let lastSentAt = 0;
  let waitTimer: ReturnType<typeof setTimeout> | undefined;
  let noticeTimer: ReturnType<typeof setTimeout> | undefined;

  const settle = () => {
    if (busy || target !== null) return;
    clearTimeout(noticeTimer);
    noticeTimer = undefined;
    onUnsent(false);
  };

  const later = (milliseconds: number) => {
    clearTimeout(waitTimer);
    waitTimer = setTimeout(run, milliseconds);
  };

  async function run() {
    if (stopped || busy || target === null) return;
    const gap = lastSentAt + liveLimits.moveGapMilliseconds - Date.now();
    if (gap > 0) return later(gap);

    const slide = target;
    target = null;
    busy = true;
    lastSentAt = Date.now();
    const result = await send(slide).catch((): MoveResult => ({ status: "failed" }));
    busy = false;
    if (stopped) return;

    if (result.status === "ended") {
      target = null;
      settle();
      return onEnded();
    }
    if (result.status === "moved") {
      onSent(slide, result.revision);
      settle();
      return run();
    }
    if (target === null) target = slide;
    later(liveLimits.moveRetryMilliseconds);
  }

  return {
    push(slide) {
      if (stopped) return;
      target = slide;
      noticeTimer ??= setTimeout(() => onUnsent(true), liveLimits.unsentNoticeMilliseconds);
      void run();
    },
    idle: () => !busy && target === null,
    stop() {
      stopped = true;
      clearTimeout(waitTimer);
      clearTimeout(noticeTimer);
    },
  };
}
