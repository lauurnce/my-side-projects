import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { slideLimits } from "@/lib/config";
import type { SaveAnswer } from "@/lib/slides/autosave";
import type { DeckContent } from "@/lib/slides/schema";
import { useAutosave, type SaveInput } from "./useAutosave";

function deck(text: string): DeckContent {
  return { v: 1, slides: [{ id: "slide001", blocks: [{ id: "title001", type: "title", x: 0, y: 0, w: 400, h: 100, text, tone: "ink" }] }] };
}

const first = deck("One");
const second = deck("Two");
const third = deck("Three");
const delay = slideLimits.saveDelayMilliseconds;

type Call = { input: SaveInput; answer: (reply: SaveAnswer) => void };

let calls: Call[];
const save = vi.fn((input: SaveInput) => new Promise<SaveAnswer>((answer) => calls.push({ input, answer })));

function start() {
  return renderHook(({ content }) => useAutosave({ deckId: "deck-1", content, initialVersion: 4, save }), {
    initialProps: { content: first },
  });
}

async function wait(milliseconds: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(milliseconds);
  });
}

async function reply(call: Call, answer: SaveAnswer) {
  await act(async () => {
    call.answer(answer);
    await vi.advanceTimersByTimeAsync(0);
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  calls = [];
  save.mockClear();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("useAutosave", () => {
  it("saves once, 1.5 seconds after the last change", async () => {
    const hook = start();
    expect(hook.result.current.indicator).toBe("saved");
    hook.rerender({ content: second });
    expect(hook.result.current.indicator).toBe("unsaved");
    await wait(delay - 100);
    hook.rerender({ content: third });
    await wait(delay - 100);
    expect(calls).toHaveLength(0);
    await wait(100);
    expect(calls).toHaveLength(1);
    expect(calls[0].input).toMatchObject({ deckId: "deck-1", knownVersion: 4, content: third });
    expect(hook.result.current.indicator).toBe("saving");
    await reply(calls[0], { status: "saved", version: 5 });
    expect(hook.result.current.indicator).toBe("saved");
    await wait(60000);
    expect(calls).toHaveLength(1);
  });

  it("does not show Saved for edits made during a save, and saves them next with the new version", async () => {
    const hook = start();
    hook.rerender({ content: second });
    await wait(delay);
    hook.rerender({ content: third });
    await reply(calls[0], { status: "saved", version: 5 });
    expect(hook.result.current.indicator).toBe("unsaved");
    await wait(delay);
    expect(calls).toHaveLength(2);
    expect(calls[1].input).toMatchObject({ knownVersion: 5, content: third });
    expect(calls[1].input.saveId).not.toBe(calls[0].input.saveId);
  });

  it("retries a failed save with the same id after a growing wait", async () => {
    const hook = start();
    hook.rerender({ content: second });
    await wait(delay);
    await reply(calls[0], { status: "failed" });
    expect(hook.result.current.indicator).toBe("not_saved");
    await wait(slideLimits.saveRetryMilliseconds[0] - 1);
    expect(calls).toHaveLength(1);
    await wait(1);
    expect(calls).toHaveLength(2);
    expect(calls[1].input.saveId).toBe(calls[0].input.saveId);
    await reply(calls[1], { status: "failed" });
    await wait(slideLimits.saveRetryMilliseconds[1]);
    expect(calls).toHaveLength(3);
    await reply(calls[2], { status: "saved", version: 5 });
    expect(hook.result.current.indicator).toBe("saved");
  });

  it("treats a save that never answers as failed and tries again", async () => {
    const hook = start();
    hook.rerender({ content: second });
    await wait(delay);
    await wait(slideLimits.saveTimeoutMilliseconds);
    expect(hook.result.current.indicator).toBe("not_saved");
    await wait(slideLimits.saveRetryMilliseconds[0]);
    expect(calls).toHaveLength(2);
    expect(calls[1].input.saveId).toBe(calls[0].input.saveId);
  });

  it("retries at once when the browser comes back online", async () => {
    const hook = start();
    hook.rerender({ content: second });
    await wait(delay);
    await reply(calls[0], { status: "failed" });
    await act(async () => {
      window.dispatchEvent(new Event("online"));
    });
    expect(calls).toHaveLength(2);
  });

  it("flush saves pending changes without waiting for the timer", async () => {
    const hook = start();
    hook.rerender({ content: second });
    let done: boolean | null = null;
    await act(async () => {
      void hook.result.current.flush().then((saved) => {
        done = saved;
      });
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(calls).toHaveLength(1);
    await reply(calls[0], { status: "saved", version: 5 });
    expect(done).toBe(true);
    await wait(delay * 2);
    expect(calls).toHaveLength(1);
  });

  it("stops on a conflict, keeps the local content and saves it over the newer version when asked", async () => {
    const hook = start();
    hook.rerender({ content: second });
    await wait(delay);
    await reply(calls[0], { status: "conflict", version: 9 });
    expect(hook.result.current.indicator).toBe("conflict");
    await wait(60000);
    expect(calls).toHaveLength(1);
    await act(async () => hook.result.current.keepMine());
    await wait(delay);
    expect(calls[1].input).toMatchObject({ knownVersion: 9, content: second });
  });

  it("stops while the deck is live and carries the session to end", async () => {
    const hook = start();
    hook.rerender({ content: second });
    await wait(delay);
    await reply(calls[0], { status: "live", sessionId: "session-1" });
    expect(hook.result.current).toMatchObject({ indicator: "live", liveSessionId: "session-1" });
    await act(async () => hook.result.current.resume());
    await wait(delay);
    expect(calls).toHaveLength(2);
  });

  it("warns before the page closes only while something is unsaved", async () => {
    const hook = start();
    const leave = () => {
      const event = new Event("beforeunload", { cancelable: true });
      window.dispatchEvent(event);
      return event.defaultPrevented;
    };
    expect(leave()).toBe(false);
    hook.rerender({ content: second });
    expect(leave()).toBe(true);
  });
});
