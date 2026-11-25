import { describe, expect, it } from "vitest";
import { liveLimits } from "@/lib/config";
import {
  applyAnswer,
  countFollowers,
  followReducer,
  liveLink,
  liveTopic,
  lookNeedsRead,
  noLive,
  pollDelay,
  toLiveState,
  type FollowState,
  type LiveState,
  type LiveSync,
} from "./live";

function liveAt(slide: number, revision: number, overrides: Partial<LiveState> = {}): LiveState {
  return { sessionId: "session-1", slide, revision, running: true, ...overrides };
}

describe("liveTopic", () => {
  it("names the channel after the deck", () => {
    expect(liveTopic("deck-1")).toBe("live:deck-1");
  });
});

describe("toLiveState", () => {
  it("carries the content version of a deck made in the editor", () => {
    expect(toLiveState({ session_id: null, current_slide: null, revision: 0, running: false, content_version: 4 })).toMatchObject({
      sessionId: null,
      contentVersion: 4,
    });
    expect(
      toLiveState({ session_id: "session-1", current_slide: 2, revision: 9, running: true, content_version: 5 }),
    ).toEqual({ sessionId: "session-1", slide: 2, revision: 9, running: true, contentVersion: 5 });
    expect(toLiveState({ session_id: null, current_slide: null, revision: 0, running: false, content_version: null })).not.toHaveProperty("contentVersion");
  });

  it("reads a session row", () => {
    expect(toLiveState({ session_id: "session-1", current_slide: 4, revision: 9, running: true })).toEqual({
      sessionId: "session-1",
      slide: 4,
      revision: 9,
      running: true,
    });
  });

  it("reads an ended session row", () => {
    expect(toLiveState({ session_id: "session-1", current_slide: 4, revision: 10, running: false })).toEqual({
      sessionId: "session-1",
      slide: 4,
      revision: 10,
      running: false,
    });
  });

  it("reads the empty answer for a deck with no session", () => {
    expect(toLiveState({ session_id: null, current_slide: null, revision: 0, running: false })).toEqual(noLive);
  });

  it.each([
    ["null", null],
    ["undefined", undefined],
    ["a string", "live"],
    ["a number", 5],
    ["an empty object", {}],
    ["an array", []],
    ["a text revision", { session_id: "session-1", current_slide: 4, revision: "9", running: true }],
    ["a missing revision", { session_id: "session-1", current_slide: 4, running: true }],
    ["a missing running flag", { session_id: "session-1", current_slide: 4, revision: 9 }],
    ["a text running flag", { session_id: "session-1", current_slide: 4, revision: 9, running: "true" }],
    ["a numeric session id", { session_id: 12, current_slide: 4, revision: 9, running: true }],
    ["a missing session id", { current_slide: 4, revision: 9, running: true }],
    ["a session with no slide", { session_id: "session-1", current_slide: null, revision: 9, running: true }],
    ["a text slide", { session_id: "session-1", current_slide: "4", revision: 9, running: true }],
  ])("gives null for %s", (_name, value) => {
    expect(toLiveState(value)).toBeNull();
  });
});

describe("applyAnswer", () => {
  const held: LiveSync = { state: liveAt(4, 10), appliedRequest: 3 };

  it("applies a newer request with a higher revision", () => {
    const answer = liveAt(5, 11);
    expect(applyAnswer(held, 4, answer)).toEqual({ state: answer, appliedRequest: 4 });
  });

  it("ignores an answer from an older request", () => {
    expect(applyAnswer(held, 2, liveAt(9, 20))).toBe(held);
  });

  it("ignores a second answer for the request already applied", () => {
    expect(applyAnswer(held, 3, liveAt(9, 20))).toBe(held);
  });

  it("ignores a lower revision from a newer request", () => {
    expect(applyAnswer(held, 4, liveAt(3, 9))).toBe(held);
  });

  it("applies the same revision so the 30 minute rule can stop a session", () => {
    const answer = liveAt(4, 10, { running: false });
    expect(applyAnswer(held, 4, answer)).toEqual({ state: answer, appliedRequest: 4 });
  });

  it("applies a session end at a higher revision", () => {
    const answer = liveAt(4, 11, { running: false });
    expect(applyAnswer(held, 4, answer).state).toEqual(answer);
  });

  it("applies a restart with a new session id and a higher revision", () => {
    const ended: LiveSync = { state: liveAt(4, 11, { running: false }), appliedRequest: 4 };
    const answer = liveAt(1, 12, { sessionId: "session-2" });
    expect(applyAnswer(ended, 5, answer)).toEqual({ state: answer, appliedRequest: 5 });
  });

  it("ignores a late empty answer after a session started", () => {
    expect(applyAnswer(held, 4, noLive)).toBe(held);
  });

  it("applies the first session over the empty state", () => {
    const answer = liveAt(1, 7);
    expect(applyAnswer({ state: noLive, appliedRequest: 0 }, 1, answer).state).toEqual(answer);
  });
});

describe("lookNeedsRead", () => {
  it.each([
    ["a lower revision", 9, false],
    ["an equal revision", 10, true],
    ["a higher revision", 11, true],
    ["a missing revision", undefined, true],
    ["a null revision", null, true],
    ["a text revision", "11", true],
  ])("answers for %s", (_name, eventRevision, expected) => {
    expect(lookNeedsRead(10, eventRevision)).toBe(expected);
  });
});

describe("liveLink", () => {
  const now = 1_000_000;

  it("is live when connected with a fresh read", () => {
    expect(liveLink({ connected: true, lastReadAt: now - 1000, now })).toBe("live");
  });

  it("is catching up when not connected with a fresh read", () => {
    expect(liveLink({ connected: false, lastReadAt: now - 1000, now })).toBe("catching_up");
  });

  it("holds until the out of touch limit is passed", () => {
    const lastReadAt = now - liveLimits.outOfTouchMilliseconds;
    expect(liveLink({ connected: true, lastReadAt, now })).toBe("live");
    expect(liveLink({ connected: false, lastReadAt, now })).toBe("catching_up");
  });

  it.each([true, false])("is out of touch after the limit, connected %s", (connected) => {
    const lastReadAt = now - liveLimits.outOfTouchMilliseconds - 1;
    expect(liveLink({ connected, lastReadAt, now })).toBe("out_of_touch");
  });
});

describe("pollDelay", () => {
  const cases = [
    ["no session", { running: false, connected: false }, liveLimits.pollIdleMilliseconds],
    ["no session with a stale connected flag", { running: false, connected: true }, liveLimits.pollIdleMilliseconds],
    ["a session with the channel up", { running: true, connected: true }, liveLimits.pollUpMilliseconds],
    ["a session with the channel down", { running: true, connected: false }, liveLimits.pollDownMilliseconds],
  ] as const;

  it.each(cases)("keeps %s inside the jitter bounds", (_name, input, base) => {
    expect(pollDelay(input, 0)).toBe(Math.round(base * (1 - liveLimits.pollJitterRatio)));
    expect(pollDelay(input, 0.5)).toBe(base);
    expect(pollDelay(input, 1)).toBe(Math.round(base * (1 + liveLimits.pollJitterRatio)));
  });

  it("uses the three configured bases", () => {
    expect(cases.map(([, input]) => pollDelay(input, 0.5))).toEqual([20000, 20000, 15000, 3000]);
  });
});

describe("followReducer", () => {
  const idle: FollowState = { wanted: 2, following: false, joined: false };
  const followingAt3: FollowState = { wanted: 3, following: true, joined: true };

  it("joins on the live slide", () => {
    expect(followReducer(idle, { type: "join", slide: 7 })).toEqual({ wanted: 7, following: true, joined: true });
  });

  it("moves with the teacher while following", () => {
    expect(followReducer(followingAt3, { type: "live", live: liveAt(4, 11) })).toEqual({
      wanted: 4,
      following: true,
      joined: true,
    });
  });

  it("keeps the same state when the teacher is already on the wanted slide", () => {
    expect(followReducer(followingAt3, { type: "live", live: liveAt(3, 11) })).toBe(followingAt3);
  });

  it("does not move a student who is browsing", () => {
    const browsing: FollowState = { wanted: 3, following: false, joined: true };
    expect(followReducer(browsing, { type: "live", live: liveAt(9, 11) })).toBe(browsing);
  });

  it("does not move a student who never joined", () => {
    expect(followReducer(idle, { type: "live", live: liveAt(9, 11) })).toBe(idle);
  });

  it("keeps the slide when the student browses freely", () => {
    expect(followReducer(followingAt3, { type: "browse" })).toEqual({ wanted: 3, following: false, joined: true });
  });

  it("stops following on a manual move", () => {
    expect(followReducer(followingAt3, { type: "move", slide: 5 })).toEqual({
      wanted: 5,
      following: false,
      joined: true,
    });
  });

  it("leaves the student on the last slide when the session ends while following", () => {
    const ended = liveAt(1, 12, { running: false });
    expect(followReducer(followingAt3, { type: "live", live: ended })).toEqual({
      wanted: 3,
      following: false,
      joined: false,
    });
  });

  it("forgets the join when the session ends while browsing", () => {
    const browsing: FollowState = { wanted: 6, following: false, joined: true };
    const ended = liveAt(1, 12, { running: false });
    expect(followReducer(browsing, { type: "live", live: ended })).toEqual({
      wanted: 6,
      following: false,
      joined: false,
    });
  });

  it("keeps the same state when nothing is running and nobody joined", () => {
    expect(followReducer(idle, { type: "live", live: noLive })).toBe(idle);
  });

  it("ends on the manual slide when the move lands before the live answer", () => {
    const moved = followReducer(followingAt3, { type: "move", slide: 5 });
    const after = followReducer(moved, { type: "live", live: liveAt(4, 11) });
    expect(after).toEqual({ wanted: 5, following: false, joined: true });
  });

  it("ends on the manual slide when the live answer lands before the move", () => {
    const pulled = followReducer(followingAt3, { type: "live", live: liveAt(4, 11) });
    const after = followReducer(pulled, { type: "move", slide: 5 });
    expect(after).toEqual({ wanted: 5, following: false, joined: true });
  });

  it("does not pull the student into a new session until they join", () => {
    const afterEnd = followReducer(followingAt3, { type: "live", live: liveAt(3, 12, { running: false }) });
    const restarted = liveAt(1, 13, { sessionId: "session-2" });
    const waiting = followReducer(afterEnd, { type: "live", live: restarted });
    expect(waiting).toEqual({ wanted: 3, following: false, joined: false });
    expect(followReducer(waiting, { type: "join", slide: restarted.slide })).toEqual({
      wanted: 1,
      following: true,
      joined: true,
    });
  });
});

describe("countFollowers", () => {
  it("counts the keys that have a following entry", () => {
    const presence = {
      "student-1": [{ following: true }],
      "student-2": [{ following: false }, { following: true }],
      "student-3": [{ following: false }],
    };
    expect(countFollowers(presence, "teacher-1")).toBe(2);
  });

  it("counts a student with two tabs once", () => {
    expect(countFollowers({ "student-1": [{ following: true }, { following: true }] }, "teacher-1")).toBe(1);
  });

  it("ignores the own key", () => {
    const presence = { "teacher-1": [{ following: true }], "student-1": [{ following: true }] };
    expect(countFollowers(presence, "teacher-1")).toBe(1);
  });

  it("ignores entries with other payloads", () => {
    const presence = {
      "student-1": [{ following: "true" }],
      "student-2": [{ following: 1 }],
      "student-3": [{ watching: true }],
      "student-4": [{ following: { following: true } }],
    };
    expect(countFollowers(presence, "teacher-1")).toBe(0);
  });

  it("gives zero for nobody", () => {
    expect(countFollowers({}, "teacher-1")).toBe(0);
  });

  it("never throws on odd entries", () => {
    const presence: Record<string, unknown[]> = {
      "student-1": [],
      "student-2": [null, undefined],
      "student-3": ["following", 7, true],
      "student-4": [[{ following: true }]],
      "student-5": [null, { following: true }],
    };
    expect(countFollowers(presence, "teacher-1")).toBe(1);
  });
});
