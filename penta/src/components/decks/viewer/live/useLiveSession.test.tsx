import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook } from "@testing-library/react";
import { liveLimits } from "@/lib/config";
import { noLive, type LiveState } from "@/lib/live";
import { useLiveSession, type LiveSessionOptions } from "./useLiveSession";

const fake = vi.hoisted(() => {
  type Binding = { type: string; event: string; callback: (message: unknown) => void };
  type FakeChannel = {
    topic: string;
    options: unknown;
    bindings: Binding[];
    report: (status: string) => void;
    on: (type: string, filter: { event: string }, callback: (message: unknown) => void) => FakeChannel;
    subscribe: (callback: (status: string) => void) => FakeChannel;
    track: ReturnType<typeof vi.fn>;
    untrack: ReturnType<typeof vi.fn>;
    presenceState: () => Record<string, unknown[]>;
  };
  const state = {
    answer: { data: null as unknown, error: null as unknown },
    channels: [] as FakeChannel[],
    pendingLeaves: [] as (() => void)[],
    holdLeaves: false,
    presence: {} as Record<string, unknown[]>,
  };
  const rpc = vi.fn(async () => state.answer);
  const channel = vi.fn((topic: string, options: unknown) => {
    const created: FakeChannel = {
      topic,
      options,
      bindings: [],
      report: () => undefined,
      on: (type, filter, callback) => {
        created.bindings.push({ type, event: filter.event, callback });
        return created;
      },
      subscribe: (callback) => {
        created.report = callback;
        return created;
      },
      track: vi.fn(async () => "ok"),
      untrack: vi.fn(async () => "ok"),
      presenceState: () => state.presence,
    };
    state.channels.push(created);
    return created;
  });
  const removeChannel = vi.fn((left: unknown) => {
    void left;
    if (!state.holdLeaves) return Promise.resolve("ok");
    return new Promise<string>((resolve) => state.pendingLeaves.push(() => resolve("ok")));
  });
  return { state, client: { rpc, channel, removeChannel } };
});

vi.mock("@/lib/supabase/client", () => ({ createClient: () => fake.client }));

const { state, client } = fake;
const emptyRow = { session_id: null, current_slide: null, revision: 0, running: false };
const down = { data: null, error: { message: "down" } };

let visibility: DocumentVisibilityState = "visible";
let random = 0.5;

function row(slide: number, revision: number, running = true) {
  return { session_id: "session-1", current_slide: slide, revision, running };
}

function answerWith(data: unknown) {
  state.answer = { data, error: null };
}

function running(slide = 3, revision = 5): LiveState {
  return { sessionId: "session-1", slide, revision, running: true };
}

function options(overrides: Partial<LiveSessionOptions> = {}): LiveSessionOptions {
  return { deckId: "deck-1", initial: running(), userId: "user-1", isOwner: false, ...overrides };
}

async function advance(milliseconds: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(milliseconds);
  });
}

async function mount(overrides: Partial<LiveSessionOptions> = {}, strict = false) {
  const hook = renderHook((props: LiveSessionOptions) => useLiveSession(props), {
    initialProps: options(overrides),
    wrapper: strict ? StrictMode : undefined,
  });
  await advance(0);
  return hook;
}

async function report(index: number, status: string) {
  await act(async () => {
    state.channels[index].report(status);
    await vi.advanceTimersByTimeAsync(0);
  });
}

function fire(index: number, type: string, message: unknown) {
  act(() => {
    state.channels[index].bindings.filter((binding) => binding.type === type).forEach((binding) => binding.callback(message));
  });
}

function look(index: number, payload: unknown) {
  fire(index, "broadcast", { payload });
}

async function send(target: EventTarget, name: string) {
  await act(async () => {
    target.dispatchEvent(new Event(name));
    await vi.advanceTimersByTimeAsync(0);
  });
}

async function setVisibility(next: DocumentVisibilityState) {
  visibility = next;
  await send(document, "visibilitychange");
}

function reads(): number {
  return client.rpc.mock.calls.length;
}

beforeEach(() => {
  vi.useFakeTimers();
  visibility = "visible";
  random = 0.5;
  vi.spyOn(document, "visibilityState", "get").mockImplementation(() => visibility);
  vi.spyOn(Math, "random").mockImplementation(() => random);
  state.channels.length = 0;
  state.pendingLeaves.length = 0;
  state.holdLeaves = false;
  state.presence = {};
  answerWith(row(3, 5));
  client.rpc.mockClear();
  client.channel.mockClear();
  client.removeChannel.mockClear();
});

afterEach(async () => {
  cleanup();
  state.holdLeaves = false;
  state.pendingLeaves.splice(0).forEach((release) => release());
  await vi.advanceTimersByTimeAsync(0);
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("useLiveSession channel", () => {
  it("creates no channel while no session is running", async () => {
    answerWith(emptyRow);
    await mount({ initial: noLive });
    await advance(liveLimits.pollIdleMilliseconds * 3);
    expect(reads()).toBe(3);
    expect(client.channel).not.toHaveBeenCalled();
  });

  it("creates one private channel for the deck once a read says a session is running", async () => {
    answerWith(emptyRow);
    const { result } = await mount({ initial: noLive });
    answerWith(row(2, 8));
    await advance(liveLimits.pollIdleMilliseconds);
    expect(result.current.live).toEqual({ sessionId: "session-1", slide: 2, revision: 8, running: true });
    expect(client.channel).toHaveBeenCalledTimes(1);
    expect(state.channels[0].topic).toBe("live:deck-1");
    expect(state.channels[0].options).toEqual({ config: { private: true, presence: { key: "user-1" } } });
  });

  it("asks the server with the deck id", async () => {
    await mount();
    await advance(liveLimits.pollDownMilliseconds);
    expect(client.rpc).toHaveBeenCalledWith("live_state", { target_deck: "deck-1" });
  });

  it("creates one channel under strict mode", async () => {
    await mount({}, true);
    expect(client.channel).toHaveBeenCalledTimes(1);
    expect(client.removeChannel).not.toHaveBeenCalled();
  });

  it("removes the channel when the session ends", async () => {
    const { result } = await mount();
    await report(0, "SUBSCRIBED");
    answerWith(row(3, 6, false));
    look(0, { session_id: "session-1", revision: 6, ended: true });
    await advance(liveLimits.lookJitterMilliseconds);
    expect(result.current.live.running).toBe(false);
    expect(client.removeChannel).toHaveBeenCalledWith(state.channels[0]);
    expect(client.channel).toHaveBeenCalledTimes(1);
  });

  it("reads once when the channel is subscribed", async () => {
    const { result } = await mount();
    expect(reads()).toBe(0);
    expect(result.current.link).toBe("catching_up");
    await report(0, "SUBSCRIBED");
    expect(reads()).toBe(1);
    expect(result.current.link).toBe("live");
  });

  it("reads after a look at or above the held revision within the jitter", async () => {
    random = 0.999;
    await mount();
    await report(0, "SUBSCRIBED");
    expect(reads()).toBe(1);
    look(0, { session_id: "session-1", revision: 5, ended: false });
    expect(reads()).toBe(1);
    await advance(liveLimits.lookJitterMilliseconds);
    expect(reads()).toBe(2);
    look(0, { session_id: "session-1", revision: 6, ended: false });
    await advance(liveLimits.lookJitterMilliseconds);
    expect(reads()).toBe(3);
    look(0, { session_id: "session-1" });
    await advance(liveLimits.lookJitterMilliseconds);
    expect(reads()).toBe(4);
  });

  it("does not read after a look below the held revision", async () => {
    await mount();
    await report(0, "SUBSCRIBED");
    look(0, { session_id: "session-1", revision: 4, ended: false });
    await advance(liveLimits.lookJitterMilliseconds);
    expect(reads()).toBe(1);
  });

  it("follows the slide a look points at", async () => {
    const { result } = await mount();
    await report(0, "SUBSCRIBED");
    answerWith(row(9, 6));
    look(0, { session_id: "session-1", revision: 6, ended: false });
    await advance(liveLimits.lookJitterMilliseconds);
    expect(result.current.live.slide).toBe(9);
    expect(result.current.live.revision).toBe(6);
  });

  it("builds a new channel after the server closes the first one", async () => {
    const { result } = await mount();
    await report(0, "SUBSCRIBED");
    await report(0, "CLOSED");
    expect(result.current.link).toBe("catching_up");
    await advance(liveLimits.rejoinMilliseconds - 1);
    expect(client.channel).toHaveBeenCalledTimes(1);
    await advance(1);
    expect(client.removeChannel).toHaveBeenCalledWith(state.channels[0]);
    expect(client.channel).toHaveBeenCalledTimes(2);
    await report(1, "SUBSCRIBED");
    expect(result.current.link).toBe("live");
  });

  it("keeps the channel and polls after a channel error", async () => {
    const { result } = await mount();
    await report(0, "SUBSCRIBED");
    await report(0, "CHANNEL_ERROR");
    expect(result.current.link).toBe("catching_up");
    const before = reads();
    await advance(liveLimits.pollDownMilliseconds * 3);
    expect(reads()).toBe(before + 3);
    expect(client.channel).toHaveBeenCalledTimes(1);
  });

  it("waits for the first leave before joining again on a fast remount", async () => {
    state.holdLeaves = true;
    const first = await mount();
    await report(0, "SUBSCRIBED");
    first.unmount();
    expect(client.removeChannel).toHaveBeenCalledTimes(1);
    const second = await mount();
    await advance(liveLimits.pollDownMilliseconds * 2);
    expect(client.channel).toHaveBeenCalledTimes(1);
    expect(second.result.current.link).toBe("catching_up");
    await act(async () => {
      state.pendingLeaves.splice(0).forEach((release) => release());
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(client.channel).toHaveBeenCalledTimes(2);
    await report(1, "SUBSCRIBED");
    expect(second.result.current.link).toBe("live");
  });
});

describe("useLiveSession polling", () => {
  it("reads about every pollDownMilliseconds while running and not subscribed", async () => {
    await mount();
    await advance(liveLimits.pollDownMilliseconds - 1);
    expect(reads()).toBe(0);
    await advance(1);
    expect(reads()).toBe(1);
    await advance(liveLimits.pollDownMilliseconds);
    expect(reads()).toBe(2);
  });

  it("reads about every pollUpMilliseconds while subscribed", async () => {
    await mount();
    await report(0, "SUBSCRIBED");
    expect(reads()).toBe(1);
    await advance(liveLimits.pollUpMilliseconds - 1);
    expect(reads()).toBe(1);
    await advance(1);
    expect(reads()).toBe(2);
    await advance(liveLimits.pollUpMilliseconds);
    expect(reads()).toBe(3);
  });

  it("reads about every pollIdleMilliseconds with no session", async () => {
    answerWith(emptyRow);
    await mount({ initial: noLive });
    await advance(liveLimits.pollIdleMilliseconds - 1);
    expect(reads()).toBe(0);
    await advance(1);
    expect(reads()).toBe(1);
    await advance(liveLimits.pollIdleMilliseconds);
    expect(reads()).toBe(2);
  });

  it("stretches and shrinks the wait with the jitter", async () => {
    random = 0;
    await mount();
    await advance(liveLimits.pollDownMilliseconds * (1 - liveLimits.pollJitterRatio));
    expect(reads()).toBe(1);
  });

  it("does not read in a hidden tab and reads once when it becomes visible", async () => {
    visibility = "hidden";
    await mount();
    await advance(liveLimits.pollDownMilliseconds * 10);
    expect(reads()).toBe(0);
    await setVisibility("visible");
    expect(reads()).toBe(1);
  });

  it("leaves live when the browser goes offline and reads at once when it is back", async () => {
    const { result } = await mount();
    await report(0, "SUBSCRIBED");
    expect(result.current.link).toBe("live");
    await send(window, "offline");
    expect(result.current.link).toBe("catching_up");
    const before = reads();
    await send(window, "online");
    expect(reads()).toBe(before + 1);
    expect(result.current.link).toBe("live");
  });

  it("becomes out of touch when reads fail for longer than the limit", async () => {
    state.answer = down;
    const mountedAt = Date.now();
    const { result } = await mount();
    await advance(liveLimits.outOfTouchMilliseconds);
    expect(reads()).toBeGreaterThan(0);
    expect(result.current.link).toBe("catching_up");
    await advance(5000);
    expect(result.current.link).toBe("out_of_touch");
    expect(result.current.lastReadAt).toBe(mountedAt);
    expect(result.current.live).toEqual(running());
  });

  it("becomes out of touch while subscribed when reads keep failing", async () => {
    state.answer = down;
    const { result } = await mount();
    await report(0, "SUBSCRIBED");
    await advance(liveLimits.outOfTouchMilliseconds + 5000);
    expect(result.current.link).toBe("out_of_touch");
  });

  it("comes back from out of touch on the next good read", async () => {
    state.answer = down;
    const { result } = await mount();
    await advance(liveLimits.outOfTouchMilliseconds + 5000);
    expect(result.current.link).toBe("out_of_touch");
    answerWith(row(4, 6));
    await advance(liveLimits.pollDownMilliseconds);
    expect(result.current.link).toBe("catching_up");
    expect(result.current.live.slide).toBe(4);
    expect(Date.now() - result.current.lastReadAt).toBeLessThan(liveLimits.pollDownMilliseconds);
  });

  it("ignores a malformed answer", async () => {
    answerWith({ session_id: "session-1", revision: "5" });
    const { result } = await mount();
    await advance(liveLimits.pollDownMilliseconds);
    expect(reads()).toBe(1);
    expect(result.current.live).toEqual(running());
  });
});

describe("useLiveSession presence", () => {
  const crowd = {
    "student-1": [{ following: true }],
    "student-2": [{ following: true }, { following: true }],
    "student-3": [{ following: false }],
    "user-1": [{ following: true }],
  };

  it("gives the owner no count until the channel is subscribed", async () => {
    state.presence = crowd;
    const { result } = await mount({ isOwner: true });
    expect(result.current.followers).toBeNull();
    fire(0, "presence", {});
    expect(result.current.followers).toBeNull();
  });

  it("gives the owner the count from a presence sync", async () => {
    const { result } = await mount({ isOwner: true });
    await report(0, "SUBSCRIBED");
    state.presence = crowd;
    fire(0, "presence", {});
    expect(result.current.followers).toBe(2);
    state.presence = { "student-1": [{ following: true }] };
    fire(0, "presence", {});
    expect(result.current.followers).toBe(1);
  });

  it("drops the count when the owner's channel goes down", async () => {
    const { result } = await mount({ isOwner: true });
    await report(0, "SUBSCRIBED");
    state.presence = crowd;
    fire(0, "presence", {});
    await report(0, "CHANNEL_ERROR");
    expect(result.current.followers).toBeNull();
    await report(0, "SUBSCRIBED");
    expect(result.current.followers).toBeNull();
  });

  it("drops the count while the owner is offline", async () => {
    const { result } = await mount({ isOwner: true });
    await report(0, "SUBSCRIBED");
    state.presence = crowd;
    fire(0, "presence", {});
    await send(window, "offline");
    expect(result.current.followers).toBeNull();
  });

  it("binds a presence handler for the owner only", async () => {
    await mount({ isOwner: true });
    expect(state.channels[0].bindings.map((binding) => `${binding.type}:${binding.event}`)).toEqual([
      "broadcast:look",
      "presence:sync",
    ]);
  });

  it("never binds a presence handler for a student", async () => {
    state.presence = crowd;
    const { result } = await mount();
    await report(0, "SUBSCRIBED");
    expect(state.channels[0].bindings.map((binding) => `${binding.type}:${binding.event}`)).toEqual(["broadcast:look"]);
    expect(result.current.followers).toBeNull();
  });

  it("tracks after the debounce when subscribed", async () => {
    const { result } = await mount();
    await report(0, "SUBSCRIBED");
    act(() => result.current.setFollowing(true));
    await advance(liveLimits.presenceDebounceMilliseconds - 1);
    expect(state.channels[0].track).not.toHaveBeenCalled();
    await advance(1);
    expect(state.channels[0].track).toHaveBeenCalledTimes(1);
    expect(state.channels[0].track).toHaveBeenCalledWith({ following: true });
  });

  it("sends one call for fast toggles", async () => {
    const { result } = await mount();
    await report(0, "SUBSCRIBED");
    act(() => {
      result.current.setFollowing(true);
      result.current.setFollowing(false);
      result.current.setFollowing(true);
    });
    await advance(liveLimits.presenceDebounceMilliseconds * 2);
    expect(state.channels[0].track).toHaveBeenCalledTimes(1);
    expect(state.channels[0].untrack).not.toHaveBeenCalled();
  });

  it("untracks after the debounce when the student stops following", async () => {
    const { result } = await mount();
    await report(0, "SUBSCRIBED");
    act(() => result.current.setFollowing(true));
    await advance(liveLimits.presenceDebounceMilliseconds);
    act(() => result.current.setFollowing(false));
    await advance(liveLimits.presenceDebounceMilliseconds);
    expect(state.channels[0].track).toHaveBeenCalledTimes(1);
    expect(state.channels[0].untrack).toHaveBeenCalledTimes(1);
  });

  it("tracks on subscribe when the student chose to follow while the channel was down", async () => {
    const { result } = await mount();
    act(() => result.current.setFollowing(true));
    await advance(liveLimits.presenceDebounceMilliseconds);
    expect(state.channels[0].track).not.toHaveBeenCalled();
    await report(0, "SUBSCRIBED");
    expect(state.channels[0].track).toHaveBeenCalledTimes(1);
    expect(state.channels[0].track).toHaveBeenCalledWith({ following: true });
  });
});
