import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { liveLimits } from "@/lib/config";
import { createMoveQueue, type MoveResult } from "./move-queue";

const { moveGapMilliseconds, moveRetryMilliseconds, unsentNoticeMilliseconds } = liveLimits;

type Flight = { slide: number; resolve: (result: MoveResult) => void; reject: (reason: Error) => void };

function harness() {
  const flights: Flight[] = [];
  const send = vi.fn(
    (slide: number) =>
      new Promise<MoveResult>((resolve, reject) => {
        flights.push({ slide, resolve, reject });
      }),
  );
  const onSent = vi.fn();
  const onEnded = vi.fn();
  const onUnsent = vi.fn();
  const queue = createMoveQueue({ send, onSent, onEnded, onUnsent });
  const sentSlides = () => send.mock.calls.map(([slide]) => slide);
  return { queue, send, onSent, onEnded, onUnsent, flights, sentSlides };
}

async function advance(milliseconds: number) {
  await vi.advanceTimersByTimeAsync(milliseconds);
}

async function answer(flight: Flight, result: MoveResult) {
  flight.resolve(result);
  await advance(0);
}

function moved(revision: number): MoveResult {
  return { status: "moved", revision };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-27T02:00:00Z"));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("createMoveQueue", () => {
  it("sends a single push once", async () => {
    const { queue, flights, sentSlides } = harness();
    queue.push(3);
    expect(sentSlides()).toEqual([3]);
    await answer(flights[0], moved(1));
    await advance(10 * moveRetryMilliseconds);
    expect(sentSlides()).toEqual([3]);
  });

  it("sends the first of three fast pushes and then only the newest", async () => {
    const { queue, flights, sentSlides } = harness();
    queue.push(5);
    queue.push(6);
    queue.push(7);
    expect(sentSlides()).toEqual([5]);
    await answer(flights[0], moved(1));
    await advance(moveGapMilliseconds);
    expect(sentSlides()).toEqual([5, 7]);
    await answer(flights[1], moved(2));
    await advance(10 * moveRetryMilliseconds);
    expect(sentSlides()).toEqual([5, 7]);
  });

  it("waits for the gap between two sends", async () => {
    const { queue, flights, sentSlides } = harness();
    queue.push(5);
    await answer(flights[0], moved(1));
    queue.push(6);
    await advance(moveGapMilliseconds - 1);
    expect(sentSlides()).toEqual([5]);
    await advance(1);
    expect(sentSlides()).toEqual([5, 6]);
  });

  it("sends at once when the gap has already passed", async () => {
    const { queue, flights, sentSlides } = harness();
    queue.push(5);
    await answer(flights[0], moved(1));
    await advance(moveGapMilliseconds);
    queue.push(6);
    expect(sentSlides()).toEqual([5, 6]);
  });

  it("never overlaps two sends", async () => {
    const { queue, flights, sentSlides } = harness();
    queue.push(1);
    queue.push(2);
    await advance(10 * moveRetryMilliseconds);
    expect(sentSlides()).toEqual([1]);
    await answer(flights[0], moved(1));
    expect(sentSlides()).toEqual([1, 2]);
  });

  it("retries a failed send after the retry delay", async () => {
    const { queue, flights, sentSlides, onSent } = harness();
    queue.push(3);
    await answer(flights[0], { status: "failed" });
    await advance(moveRetryMilliseconds - 1);
    expect(sentSlides()).toEqual([3]);
    await advance(1);
    expect(sentSlides()).toEqual([3, 3]);
    await answer(flights[1], moved(8));
    expect(onSent).toHaveBeenCalledTimes(1);
    expect(onSent).toHaveBeenCalledWith(3, 8);
  });

  it("keeps retrying while sends keep failing", async () => {
    const { queue, flights, sentSlides } = harness();
    queue.push(3);
    await answer(flights[0], { status: "failed" });
    await advance(moveRetryMilliseconds);
    await answer(flights[1], { status: "failed" });
    await advance(moveRetryMilliseconds);
    expect(sentSlides()).toEqual([3, 3, 3]);
  });

  it("replaces a failed target with a newer push made after the failure", async () => {
    const { queue, flights, sentSlides } = harness();
    queue.push(3);
    await answer(flights[0], { status: "failed" });
    queue.push(4);
    await advance(moveRetryMilliseconds);
    expect(sentSlides()).toEqual([3, 4]);
    await answer(flights[1], moved(2));
    await advance(10 * moveRetryMilliseconds);
    expect(sentSlides()).toEqual([3, 4]);
  });

  it("replaces a failed target with a newer push made while it was in flight", async () => {
    const { queue, flights, sentSlides } = harness();
    queue.push(3);
    queue.push(4);
    await answer(flights[0], { status: "failed" });
    await advance(moveRetryMilliseconds);
    expect(sentSlides()).toEqual([3, 4]);
  });

  it("treats a send that rejects as failed and retries it", async () => {
    const { queue, flights, sentSlides, onSent, onEnded } = harness();
    queue.push(3);
    flights[0].reject(new Error("network down"));
    await advance(0);
    expect(onSent).not.toHaveBeenCalled();
    expect(onEnded).not.toHaveBeenCalled();
    expect(queue.idle()).toBe(false);
    await advance(moveRetryMilliseconds);
    expect(sentSlides()).toEqual([3, 3]);
  });

  it("stops on ended, calls onEnded and drops the pending target", async () => {
    const { queue, flights, sentSlides, onSent, onEnded } = harness();
    queue.push(5);
    queue.push(6);
    await answer(flights[0], { status: "ended" });
    expect(onEnded).toHaveBeenCalledTimes(1);
    expect(onSent).not.toHaveBeenCalled();
    expect(queue.idle()).toBe(true);
    await advance(10 * moveRetryMilliseconds);
    expect(sentSlides()).toEqual([5]);
  });

  it("clears the unsent notice on ended", async () => {
    const { queue, flights, onUnsent } = harness();
    queue.push(5);
    await advance(unsentNoticeMilliseconds);
    expect(onUnsent).toHaveBeenLastCalledWith(true);
    await answer(flights[0], { status: "ended" });
    expect(onUnsent).toHaveBeenLastCalledWith(false);
    await advance(10 * unsentNoticeMilliseconds);
    expect(onUnsent).toHaveBeenLastCalledWith(false);
  });

  it("gives onSent the slide and the revision of each send", async () => {
    const { queue, flights, onSent } = harness();
    queue.push(5);
    queue.push(7);
    await answer(flights[0], moved(41));
    await advance(moveGapMilliseconds);
    await answer(flights[1], moved(42));
    expect(onSent.mock.calls).toEqual([
      [5, 41],
      [7, 42],
    ]);
  });

  it("reports unsent after the notice delay while a move is unconfirmed", async () => {
    const { queue, flights, onUnsent } = harness();
    queue.push(5);
    await advance(unsentNoticeMilliseconds - 1);
    expect(onUnsent).not.toHaveBeenCalledWith(true);
    await advance(1);
    expect(onUnsent).toHaveBeenCalledWith(true);
    await answer(flights[0], moved(1));
    expect(onUnsent).toHaveBeenLastCalledWith(false);
  });

  it("reports unsent while a failed move is still being retried", async () => {
    const { queue, flights, onUnsent } = harness();
    queue.push(5);
    await answer(flights[0], { status: "failed" });
    expect(onUnsent).not.toHaveBeenCalled();
    await advance(moveRetryMilliseconds);
    await answer(flights[1], { status: "failed" });
    await advance(unsentNoticeMilliseconds - moveRetryMilliseconds);
    expect(onUnsent.mock.calls).toEqual([[true]]);
    await advance(moveRetryMilliseconds);
    await answer(flights[2], moved(1));
    expect(onUnsent.mock.calls).toEqual([[true], [false]]);
  });

  it("never reports unsent when every send is confirmed in time", async () => {
    const { queue, flights, onUnsent } = harness();
    queue.push(5);
    await answer(flights[0], moved(1));
    await advance(10 * unsentNoticeMilliseconds);
    expect(onUnsent).not.toHaveBeenCalledWith(true);
    expect(onUnsent).toHaveBeenLastCalledWith(false);
  });

  it("does not clear unsent while a newer target is still pending", async () => {
    const { queue, flights, onUnsent } = harness();
    queue.push(5);
    queue.push(6);
    await answer(flights[0], moved(1));
    expect(onUnsent).not.toHaveBeenCalled();
    await advance(moveGapMilliseconds);
    await advance(unsentNoticeMilliseconds - moveGapMilliseconds);
    expect(onUnsent.mock.calls).toEqual([[true]]);
    await answer(flights[1], moved(2));
    expect(onUnsent.mock.calls).toEqual([[true], [false]]);
  });

  it("starts a fresh notice delay for a push made after everything was sent", async () => {
    const { queue, flights, onUnsent } = harness();
    queue.push(5);
    await answer(flights[0], moved(1));
    await advance(unsentNoticeMilliseconds);
    onUnsent.mockClear();
    queue.push(6);
    await advance(unsentNoticeMilliseconds - 1);
    expect(onUnsent).not.toHaveBeenCalled();
    await advance(1);
    expect(onUnsent.mock.calls).toEqual([[true]]);
  });

  it("is idle only when nothing is in flight and nothing is pending", async () => {
    const { queue, flights } = harness();
    expect(queue.idle()).toBe(true);
    queue.push(5);
    expect(queue.idle()).toBe(false);
    queue.push(6);
    await answer(flights[0], moved(1));
    expect(queue.idle()).toBe(false);
    await advance(moveGapMilliseconds);
    expect(queue.idle()).toBe(false);
    await answer(flights[1], moved(2));
    expect(queue.idle()).toBe(true);
  });

  it("is not idle while a failed move waits for its retry", async () => {
    const { queue, flights } = harness();
    queue.push(5);
    await answer(flights[0], { status: "failed" });
    expect(queue.idle()).toBe(false);
    await advance(moveRetryMilliseconds);
    expect(queue.idle()).toBe(false);
  });

  it("sends nothing for a push after stop", async () => {
    const { queue, send } = harness();
    queue.stop();
    queue.push(5);
    await advance(10 * moveRetryMilliseconds);
    expect(send).not.toHaveBeenCalled();
  });

  it("sends no pending target after stop", async () => {
    const { queue, flights, sentSlides, onSent } = harness();
    queue.push(5);
    queue.push(6);
    queue.stop();
    await answer(flights[0], moved(1));
    await advance(10 * moveRetryMilliseconds);
    expect(sentSlides()).toEqual([5]);
    expect(onSent).not.toHaveBeenCalled();
  });

  it("cancels a waiting retry and the unsent notice on stop", async () => {
    const { queue, flights, sentSlides, onUnsent } = harness();
    queue.push(5);
    await answer(flights[0], { status: "failed" });
    queue.stop();
    await advance(10 * unsentNoticeMilliseconds);
    expect(sentSlides()).toEqual([5]);
    expect(onUnsent).not.toHaveBeenCalled();
  });

  it("does not call onEnded for an answer that lands after stop", async () => {
    const { queue, flights, onEnded } = harness();
    queue.push(5);
    queue.stop();
    await answer(flights[0], { status: "ended" });
    expect(onEnded).not.toHaveBeenCalled();
  });
});
