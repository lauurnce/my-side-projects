import { describe, expect, it } from "vitest";
import { threadLimits } from "@/lib/config";
import type { OpenThread } from "@/lib/threads";
import { applyThreadAnswer, decideAnswer, lookDelay, threadPollDelay, threadTopic, type ThreadSync } from "./thread-sync";

function open(version: number): OpenThread {
  return {
    status: "ok",
    version,
    thread: {
      id: "thread-1",
      classId: "class-1",
      lessonId: "lesson-1",
      activityId: null,
      targetTitle: "Networks",
      title: "What is a subnet mask?",
      locked: false,
      canModerate: false,
    },
    posts: [],
  };
}

function holding(version: number, appliedRequest = 0): ThreadSync {
  return { view: open(version), appliedRequest };
}

const gone: ThreadSync = { view: null, appliedRequest: 4 };

describe("decideAnswer", () => {
  it("applies a newer version from a newer request", () => {
    expect(decideAnswer(holding(5, 2), 3, open(6))).toBe("apply");
  });

  it("applies the same version from a newer request", () => {
    expect(decideAnswer(holding(5, 2), 3, open(5))).toBe("apply");
  });

  it("keeps the view when the version is lower", () => {
    expect(decideAnswer(holding(5, 2), 3, open(4))).toBe("keep");
  });

  it("keeps the view when the request is not newer than the applied one", () => {
    expect(decideAnswer(holding(5, 3), 3, open(9))).toBe("keep");
    expect(decideAnswer(holding(5, 3), 2, open(9))).toBe("keep");
  });

  it("keeps the view on unchanged", () => {
    expect(decideAnswer(holding(5, 2), 3, { status: "unchanged", version: 5 })).toBe("keep");
  });

  it("keeps the view on a network or server error", () => {
    expect(decideAnswer(holding(5, 2), 3, null)).toBe("keep");
  });

  it("treats not found from a newer request as gone", () => {
    expect(decideAnswer(holding(5, 2), 3, { status: "not_found" })).toBe("gone");
  });

  it("keeps the view when a not found answer is older than the applied request", () => {
    expect(decideAnswer(holding(5, 3), 2, { status: "not_found" })).toBe("keep");
  });

  it("applies any version from a newer request once the thread is gone", () => {
    expect(decideAnswer(gone, 5, open(1))).toBe("apply");
  });

  it("stays gone on an answer older than the not found one", () => {
    expect(decideAnswer(gone, 3, open(9))).toBe("keep");
  });
});

describe("applyThreadAnswer", () => {
  it("replaces the view and records the request", () => {
    const answer = open(6);
    const next = applyThreadAnswer(holding(5, 2), 3, answer);
    expect(next.view).toBe(answer);
    expect(next.appliedRequest).toBe(3);
  });

  it("returns the same object when nothing changes", () => {
    const sync = holding(5, 2);
    expect(applyThreadAnswer(sync, 3, { status: "unchanged", version: 5 })).toBe(sync);
    expect(applyThreadAnswer(sync, 3, null)).toBe(sync);
    expect(applyThreadAnswer(sync, 3, open(4))).toBe(sync);
    expect(applyThreadAnswer(sync, 1, open(9))).toBe(sync);
  });

  it("clears the view on not found and records the request", () => {
    expect(applyThreadAnswer(holding(5, 2), 3, { status: "not_found" })).toEqual({ view: null, appliedRequest: 3 });
  });

  it("brings the view back after it was gone", () => {
    const answer = open(7);
    expect(applyThreadAnswer(gone, 5, answer)).toEqual({ view: answer, appliedRequest: 5 });
  });

  it("stays gone on unchanged and on an error", () => {
    expect(applyThreadAnswer(gone, 5, { status: "unchanged", version: 5 })).toBe(gone);
    expect(applyThreadAnswer(gone, 5, null)).toBe(gone);
  });
});

describe("threadPollDelay", () => {
  const down = threadLimits.pollDownMilliseconds;
  const up = threadLimits.pollUpMilliseconds;
  const ratio = threadLimits.pollJitterRatio;

  it("polls fast while the thread is open and the channel is down", () => {
    expect(threadPollDelay({ available: true, connected: false }, 0.5)).toBe(down);
  });

  it("polls slowly while subscribed", () => {
    expect(threadPollDelay({ available: true, connected: true }, 0.5)).toBe(up);
  });

  it("polls slowly while the thread is gone", () => {
    expect(threadPollDelay({ available: false, connected: false }, 0.5)).toBe(up);
  });

  it("stays inside the jitter bounds", () => {
    expect(threadPollDelay({ available: true, connected: false }, 0)).toBe(Math.round(down * (1 - ratio)));
    expect(threadPollDelay({ available: true, connected: false }, 1)).toBe(Math.round(down * (1 + ratio)));
    expect(threadPollDelay({ available: true, connected: true }, 0)).toBe(Math.round(up * (1 - ratio)));
    expect(threadPollDelay({ available: true, connected: true }, 1)).toBe(Math.round(up * (1 + ratio)));
  });
});

describe("lookDelay", () => {
  it("spreads reads between zero and the look jitter", () => {
    expect(lookDelay(0)).toBe(0);
    expect(lookDelay(0.5)).toBe(threadLimits.lookJitterMilliseconds / 2);
    expect(lookDelay(1)).toBe(threadLimits.lookJitterMilliseconds);
  });
});

describe("threadTopic", () => {
  it("names the channel after the thread", () => {
    expect(threadTopic("abc")).toBe("thread:abc");
  });
});
