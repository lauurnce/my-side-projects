import type { AnswerValue } from "@/lib/quiz";

export type SaveOutcome = "saved" | "late" | "submitted" | "refused" | "failed";
export type SaveStatus = "saved" | "saving" | "unsaved";

export type SaveQueueOptions = {
  send: (questionId: string, answer: AnswerValue) => Promise<SaveOutcome>;
  onStatus: (status: SaveStatus) => void;
  onClosed: () => void;
};

export type SaveQueue = {
  push: (questionId: string, answer: AnswerValue, waitMilliseconds?: number) => void;
  flush: (questionId: string) => void;
  stop: () => void;
};

type Slot = {
  waiting: { answer: AnswerValue } | null;
  busy: boolean;
  failed: boolean;
  timer: ReturnType<typeof setTimeout> | undefined;
};

const closing: readonly SaveOutcome[] = ["late", "submitted"];

export function createSaveQueue({ send, onStatus, onClosed }: SaveQueueOptions): SaveQueue {
  const slots = new Map<string, Slot>();
  let stopped = false;
  let shown: SaveStatus | null = null;

  const slotOf = (questionId: string): Slot => {
    const held = slots.get(questionId);
    if (held) return held;
    const slot: Slot = { waiting: null, busy: false, failed: false, timer: undefined };
    slots.set(questionId, slot);
    return slot;
  };

  const currentStatus = (): SaveStatus => {
    const all = [...slots.values()];
    if (all.some((slot) => slot.busy || slot.timer !== undefined || (slot.waiting && !slot.failed))) return "saving";
    return all.some((slot) => slot.failed) ? "unsaved" : "saved";
  };

  const report = () => {
    const status = currentStatus();
    if (status === shown) return;
    shown = status;
    onStatus(status);
  };

  const stop = () => {
    stopped = true;
    for (const slot of slots.values()) clearTimeout(slot.timer);
  };

  async function run(questionId: string) {
    const slot = slotOf(questionId);
    if (stopped || slot.busy || !slot.waiting) return;

    const { answer } = slot.waiting;
    slot.waiting = null;
    slot.busy = true;
    report();
    const outcome = await send(questionId, answer).catch((): SaveOutcome => "failed");
    slot.busy = false;
    if (stopped) return;

    if (closing.includes(outcome)) {
      stop();
      return onClosed();
    }
    slot.failed = outcome !== "saved";
    const changedMeanwhile = slot.waiting !== null;
    if (outcome === "failed" && !changedMeanwhile) slot.waiting = { answer };
    report();
    if (changedMeanwhile && slot.timer === undefined) void run(questionId);
  }

  const retryFailed = (exceptQuestionId: string) => {
    for (const [questionId, slot] of slots) {
      if (questionId !== exceptQuestionId && slot.failed && slot.waiting && slot.timer === undefined) void run(questionId);
    }
  };

  return {
    push(questionId, answer, waitMilliseconds = 0) {
      if (stopped) return;
      const slot = slotOf(questionId);
      slot.waiting = { answer };
      clearTimeout(slot.timer);
      slot.timer = undefined;
      retryFailed(questionId);
      if (waitMilliseconds <= 0) return void run(questionId);
      slot.timer = setTimeout(() => {
        slot.timer = undefined;
        void run(questionId);
      }, waitMilliseconds);
      report();
    },
    flush(questionId) {
      const slot = slots.get(questionId);
      if (stopped || !slot || slot.timer === undefined) return;
      clearTimeout(slot.timer);
      slot.timer = undefined;
      void run(questionId);
    },
    stop,
  };
}
