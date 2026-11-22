import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AnswerValue } from "@/lib/quiz";
import { createSaveQueue, type SaveOutcome, type SaveStatus } from "./save-queue";

type Call = { questionId: string; answer: AnswerValue; finish: (outcome: SaveOutcome) => void; fail: () => void };

function harness() {
  const calls: Call[] = [];
  const statuses: SaveStatus[] = [];
  const onClosed = vi.fn();
  const queue = createSaveQueue({
    send: (questionId, answer) =>
      new Promise<SaveOutcome>((resolve, reject) => {
        calls.push({ questionId, answer, finish: resolve, fail: () => reject(new Error("offline")) });
      }),
    onStatus: (status) => statuses.push(status),
    onClosed,
  });
  return { calls, statuses, onClosed, queue };
}

async function settle() {
  await vi.advanceTimersByTimeAsync(0);
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("createSaveQueue", () => {
  it("sends a choice at once and reports saving then saved", async () => {
    const { calls, statuses, queue } = harness();

    queue.push("q1", 2);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ questionId: "q1", answer: 2 });
    expect(statuses).toEqual(["saving"]);

    calls[0].finish("saved");
    await settle();
    expect(statuses).toEqual(["saving", "saved"]);
  });

  it("waits for the pause in typing before sending text", async () => {
    const { calls, queue } = harness();

    queue.push("q1", "b", 600);
    await vi.advanceTimersByTimeAsync(400);
    queue.push("q1", "br", 600);
    await vi.advanceTimersByTimeAsync(400);
    queue.push("q1", "broker", 600);
    await vi.advanceTimersByTimeAsync(599);
    expect(calls).toHaveLength(0);

    await vi.advanceTimersByTimeAsync(1);
    expect(calls.map((call) => call.answer)).toEqual(["broker"]);
  });

  it("keeps one request in flight per question and sends only the newest after it", async () => {
    const { calls, queue } = harness();

    queue.push("q1", 0);
    queue.push("q1", 1);
    queue.push("q1", 2);
    queue.push("q1", 3);
    expect(calls).toHaveLength(1);

    calls[0].finish("saved");
    await settle();
    expect(calls.map((call) => call.answer)).toEqual([0, 3]);

    calls[1].finish("saved");
    await settle();
    expect(calls).toHaveLength(2);
  });

  it("lets different questions save at the same time", () => {
    const { calls, queue } = harness();

    queue.push("q1", 0);
    queue.push("q2", true);

    expect(calls.map((call) => call.questionId)).toEqual(["q1", "q2"]);
  });

  it("sends the text on blur without waiting", async () => {
    const { calls, queue } = harness();

    queue.push("q1", "broker", 600);
    queue.flush("q1");
    expect(calls.map((call) => call.answer)).toEqual(["broker"]);

    await vi.advanceTimersByTimeAsync(2000);
    expect(calls).toHaveLength(1);
  });

  it("does nothing on blur when nothing waits", () => {
    const { calls, queue } = harness();

    queue.flush("q1");
    queue.push("q1", 1);
    queue.flush("q1");

    expect(calls).toHaveLength(1);
  });

  it("reports a failed save and does not retry on its own", async () => {
    const { calls, statuses, queue } = harness();

    queue.push("q1", 1);
    calls[0].fail();
    await settle();
    await vi.advanceTimersByTimeAsync(60_000);

    expect(calls).toHaveLength(1);
    expect(statuses).toEqual(["saving", "unsaved"]);
  });

  it("retries a failed save on the next change to another question", async () => {
    const { calls, statuses, queue } = harness();

    queue.push("q1", 1);
    calls[0].finish("failed");
    await settle();

    queue.push("q2", true);
    expect(calls.slice(1).map((call) => [call.questionId, call.answer])).toEqual([
      ["q1", 1],
      ["q2", true],
    ]);

    calls[1].finish("saved");
    calls[2].finish("saved");
    await settle();
    expect(statuses.at(-1)).toBe("saved");
  });

  it("sends the newest value after a failed save of the same question", async () => {
    const { calls, queue } = harness();

    queue.push("q1", 1);
    calls[0].finish("failed");
    await settle();
    queue.push("q1", 2);

    expect(calls.map((call) => call.answer)).toEqual([1, 2]);
  });

  it("sends the newest value when the one in flight fails", async () => {
    const { calls, queue } = harness();

    queue.push("q1", 1);
    queue.push("q1", 2);
    calls[0].fail();
    await settle();

    expect(calls.map((call) => call.answer)).toEqual([1, 2]);
  });

  it("does not resend a refused answer", async () => {
    const { calls, statuses, queue } = harness();

    queue.push("q1", 9);
    calls[0].finish("refused");
    await settle();
    queue.push("q2", true);

    expect(calls.map((call) => call.questionId)).toEqual(["q1", "q2"]);
    expect(statuses).toContain("unsaved");
  });

  it.each<SaveOutcome>(["late", "submitted"])("closes on a %s reply and sends nothing more", async (outcome) => {
    const { calls, onClosed, queue } = harness();

    queue.push("q1", 1);
    queue.push("q2", "text", 600);
    calls[0].finish(outcome);
    await settle();
    queue.push("q3", true);
    await vi.advanceTimersByTimeAsync(5000);

    expect(onClosed).toHaveBeenCalledTimes(1);
    expect(calls).toHaveLength(1);
  });

  it("sends nothing after stop", async () => {
    const { calls, statuses, queue } = harness();

    queue.push("q1", "text", 600);
    queue.stop();
    queue.push("q2", 1);
    await vi.advanceTimersByTimeAsync(5000);

    expect(calls).toHaveLength(0);
    expect(statuses).toEqual(["saving"]);
  });
});
