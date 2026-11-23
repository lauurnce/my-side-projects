import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook } from "@testing-library/react";
import { threadLimits } from "@/lib/config";
import { toThreadView, type OpenThread } from "@/lib/threads";
import { useThreadLive } from "./useThreadLive";

const fake = vi.hoisted(() => {
  type Answer = { data: unknown; error: unknown };
  type Binding = { type: string; event: string; callback: (message: unknown) => void };
  type FakeChannel = {
    topic: string;
    options: unknown;
    bindings: Binding[];
    report: (status: string) => void;
    on: (type: string, filter: { event: string }, callback: (message: unknown) => void) => FakeChannel;
    subscribe: (callback: (status: string) => void) => FakeChannel;
    send: ReturnType<typeof vi.fn>;
    track: ReturnType<typeof vi.fn>;
  };
  const state = {
    answer: { data: null, error: null } as Answer,
    queued: [] as (() => Promise<Answer>)[],
    channels: [] as FakeChannel[],
    pendingLeaves: [] as (() => void)[],
    holdLeaves: false,
  };
  const rpc = vi.fn((name: string, args: unknown) => {
    void name;
    void args;
    const next = state.queued.shift();
    return next ? next() : Promise.resolve(state.answer);
  });
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
      send: vi.fn(),
      track: vi.fn(),
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
const threadId = "thread-1";
const down = { data: null, error: { message: "down" } };
const notFound = { status: "not_found" };

let visibility: DocumentVisibilityState = "visible";
let random = 0.5;

function postRow(id: string, body: string, isQuestion = false) {
  return {
    id,
    parent_id: null,
    is_question: isQuestion,
    author_name: "Ana Reyes",
    author_role: "student",
    mine: false,
    can_edit: false,
    body,
    created_at: "2026-11-27T01:00:00Z",
    edited_at: null,
    hidden: false,
    author_id: null,
    author_in_class: true,
    edit_count: 0,
  };
}

function row(version: number, answers: string[] = []) {
  return {
    status: "ok",
    version,
    thread: {
      id: threadId,
      class_id: "class-1",
      lesson_id: "lesson-1",
      activity_id: null,
      target_title: "Networks",
      title: "What is a subnet mask?",
      locked: false,
      can_moderate: false,
    },
    posts: [
      postRow("post-1", "I do not get the slash notation.", true),
      ...answers.map((body, index) => postRow(`post-${index + 2}`, body)),
    ],
  };
}

function unchanged(version: number) {
  return { status: "unchanged", version };
}

function opened(version = 5): OpenThread {
  const view = toThreadView(row(version));
  if (view?.status !== "ok") throw new Error("bad fixture");
  return view;
}

function answerWith(data: unknown) {
  state.answer = { data, error: null };
}

function holdNextRead() {
  let release: (data: unknown) => void = () => undefined;
  const pending = new Promise<{ data: unknown; error: unknown }>((resolve) => {
    release = (data) => resolve({ data, error: null });
  });
  state.queued.push(() => pending);
  return (data: unknown) => release(data);
}

async function advance(milliseconds: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(milliseconds);
  });
}

async function mount(initial: OpenThread = opened(), strict = false) {
  const hook = renderHook((props: OpenThread) => useThreadLive(props), {
    initialProps: initial,
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

function look(index: number) {
  act(() => {
    state.channels[index].bindings.forEach((binding) => binding.callback({ event: "look", payload: {} }));
  });
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

async function releaseLeaves() {
  await act(async () => {
    state.pendingLeaves.splice(0).forEach((release) => release());
    await vi.advanceTimersByTimeAsync(0);
  });
}

function reads(): number {
  return client.rpc.mock.calls.length;
}

function lastRead(): unknown[] {
  return client.rpc.mock.calls[reads() - 1];
}

async function mountGone() {
  const hook = await mount();
  await report(0, "SUBSCRIBED");
  answerWith(notFound);
  look(0);
  await advance(threadLimits.lookJitterMilliseconds);
  return hook;
}

beforeEach(() => {
  vi.useFakeTimers();
  visibility = "visible";
  random = 0.5;
  vi.spyOn(document, "visibilityState", "get").mockImplementation(() => visibility);
  vi.spyOn(Math, "random").mockImplementation(() => random);
  state.channels.length = 0;
  state.queued.length = 0;
  state.pendingLeaves.length = 0;
  state.holdLeaves = false;
  answerWith(unchanged(5));
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

describe("useThreadLive channel", () => {
  it("starts from the first view without reading", async () => {
    const initial = opened();
    const { result } = await mount(initial);
    expect(result.current.view).toBe(initial);
    expect(result.current.link).toBe("catching_up");
    expect(reads()).toBe(0);
  });

  it("creates one private channel for the thread with a look handler and no presence", async () => {
    await mount();
    expect(client.channel).toHaveBeenCalledTimes(1);
    expect(state.channels[0].topic).toBe("thread:thread-1");
    expect(state.channels[0].options).toEqual({ config: { private: true } });
    expect(state.channels[0].bindings.map((binding) => `${binding.type}:${binding.event}`)).toEqual(["broadcast:look"]);
  });

  it("creates one channel under strict mode", async () => {
    await mount(opened(), true);
    expect(client.channel).toHaveBeenCalledTimes(1);
    expect(client.removeChannel).not.toHaveBeenCalled();
  });

  it("reads once with the held version when subscribed and becomes live", async () => {
    const { result } = await mount();
    await report(0, "SUBSCRIBED");
    expect(reads()).toBe(1);
    expect(client.rpc).toHaveBeenCalledWith("thread_view", { target_thread: threadId, known_version: 5 });
    expect(result.current.link).toBe("live");
  });

  it("reads within the look jitter and shows the new posts", async () => {
    random = 0.999;
    const { result } = await mount();
    await report(0, "SUBSCRIBED");
    answerWith(row(6, ["It is the count of network bits."]));
    look(0);
    expect(reads()).toBe(1);
    await advance(threadLimits.lookJitterMilliseconds);
    expect(reads()).toBe(2);
    expect(result.current.view?.version).toBe(6);
    expect(result.current.view?.posts.map((post) => post.body)).toEqual([
      "I do not get the slash notation.",
      "It is the count of network bits.",
    ]);
    answerWith(unchanged(6));
    look(0);
    await advance(threadLimits.lookJitterMilliseconds);
    expect(lastRead()).toEqual(["thread_view", { target_thread: threadId, known_version: 6 }]);
  });

  it("reads once for a burst of looks", async () => {
    await mount();
    await report(0, "SUBSCRIBED");
    look(0);
    look(0);
    look(0);
    await advance(threadLimits.lookJitterMilliseconds);
    expect(reads()).toBe(2);
  });

  it("keeps the same view object when the answer is unchanged", async () => {
    const initial = opened();
    const { result } = await mount(initial);
    await report(0, "SUBSCRIBED");
    look(0);
    await advance(threadLimits.lookJitterMilliseconds);
    expect(reads()).toBe(2);
    expect(result.current.view).toBe(initial);
  });

  it("never sends or tracks on the channel", async () => {
    const { result } = await mount();
    await report(0, "SUBSCRIBED");
    answerWith(row(6, ["It is the count of network bits."]));
    look(0);
    await advance(threadLimits.pollUpMilliseconds);
    await act(() => result.current.refresh());
    expect(state.channels[0].send).not.toHaveBeenCalled();
    expect(state.channels[0].track).not.toHaveBeenCalled();
  });

  it("keeps the channel and polls after a channel error", async () => {
    const { result } = await mount();
    await report(0, "SUBSCRIBED");
    await report(0, "CHANNEL_ERROR");
    expect(result.current.link).toBe("catching_up");
    const before = reads();
    await advance(threadLimits.pollDownMilliseconds * 3);
    expect(reads()).toBe(before + 3);
    expect(client.channel).toHaveBeenCalledTimes(1);
    expect(client.removeChannel).not.toHaveBeenCalled();
  });

  it("keeps the channel and polls after a timeout", async () => {
    const { result } = await mount();
    await report(0, "TIMED_OUT");
    expect(result.current.link).toBe("catching_up");
    await advance(threadLimits.pollDownMilliseconds * 2);
    expect(reads()).toBe(2);
    expect(client.channel).toHaveBeenCalledTimes(1);
  });

  it("builds a new channel after the server closes the first one", async () => {
    const { result } = await mount();
    await report(0, "SUBSCRIBED");
    await report(0, "CLOSED");
    expect(result.current.link).toBe("catching_up");
    await advance(threadLimits.rejoinMilliseconds - 1);
    expect(client.channel).toHaveBeenCalledTimes(1);
    await advance(1);
    expect(client.removeChannel).toHaveBeenCalledWith(state.channels[0]);
    expect(client.channel).toHaveBeenCalledTimes(2);
    await report(1, "SUBSCRIBED");
    expect(result.current.link).toBe("live");
  });

  it("waits for the first leave before joining again on a fast remount", async () => {
    state.holdLeaves = true;
    const first = await mount();
    await report(0, "SUBSCRIBED");
    first.unmount();
    expect(client.removeChannel).toHaveBeenCalledTimes(1);
    const second = await mount();
    await advance(threadLimits.pollDownMilliseconds * 2);
    expect(client.channel).toHaveBeenCalledTimes(1);
    expect(second.result.current.link).toBe("catching_up");
    await releaseLeaves();
    expect(client.channel).toHaveBeenCalledTimes(2);
    await report(1, "SUBSCRIBED");
    expect(second.result.current.link).toBe("live");
  });

  it("removes the channel and stops every timer on unmount", async () => {
    const { unmount } = await mount();
    await report(0, "SUBSCRIBED");
    look(0);
    unmount();
    expect(client.removeChannel).toHaveBeenCalledWith(state.channels[0]);
    const before = reads();
    await advance(threadLimits.pollUpMilliseconds * 2);
    await send(window, "online");
    await send(document, "visibilitychange");
    expect(reads()).toBe(before);
    expect(client.channel).toHaveBeenCalledTimes(1);
  });
});

describe("useThreadLive answers", () => {
  it("ignores an answer from an older request that lands after a newer one", async () => {
    const { result } = await mount();
    const releaseOlder = holdNextRead();
    const releaseNewer = holdNextRead();
    let older = Promise.resolve();
    let newer = Promise.resolve();
    act(() => {
      older = result.current.refresh();
      newer = result.current.refresh();
    });
    await act(async () => {
      releaseNewer(row(7, ["Newer answer."]));
      await newer;
    });
    expect(result.current.view?.version).toBe(7);
    await act(async () => {
      releaseOlder(row(8, ["Older request."]));
      await older;
    });
    expect(result.current.view?.version).toBe(7);
    expect(result.current.view?.posts.at(-1)?.body).toBe("Newer answer.");
  });

  it("ignores a lower version", async () => {
    const initial = opened();
    const { result } = await mount(initial);
    answerWith(row(4, ["From an old copy."]));
    await act(() => result.current.refresh());
    expect(reads()).toBe(1);
    expect(result.current.view).toBe(initial);
  });

  it("clears the view, removes the channel and stops the fast poll on not found", async () => {
    const { result } = await mountGone();
    expect(result.current.view).toBeNull();
    expect(result.current.link).toBe("catching_up");
    expect(client.removeChannel).toHaveBeenCalledWith(state.channels[0]);
    const before = reads();
    await advance(threadLimits.pollDownMilliseconds * 3);
    expect(reads()).toBe(before);
    expect(client.channel).toHaveBeenCalledTimes(1);
  });

  it("brings the thread back when the slow check finds it again", async () => {
    const { result } = await mountGone();
    const before = reads();
    answerWith(row(7));
    await advance(threadLimits.pollUpMilliseconds);
    expect(reads()).toBe(before + 1);
    expect(lastRead()).toEqual(["thread_view", { target_thread: threadId, known_version: undefined }]);
    expect(result.current.view?.version).toBe(7);
    expect(client.channel).toHaveBeenCalledTimes(2);
    await report(1, "SUBSCRIBED");
    expect(result.current.link).toBe("live");
  });

  it("stays gone while the slow check still answers not found", async () => {
    const { result } = await mountGone();
    await advance(threadLimits.pollUpMilliseconds * 2);
    expect(result.current.view).toBeNull();
    expect(client.channel).toHaveBeenCalledTimes(1);
  });

  it("brings the thread back on a refresh", async () => {
    const { result } = await mountGone();
    answerWith(row(7));
    await act(() => result.current.refresh());
    expect(result.current.view?.version).toBe(7);
    expect(client.channel).toHaveBeenCalledTimes(2);
  });

  it("does not bring the thread back from an answer older than the not found one", async () => {
    const { result } = await mount();
    const releaseOlder = holdNextRead();
    let older = Promise.resolve();
    act(() => {
      older = result.current.refresh();
    });
    answerWith(notFound);
    await act(() => result.current.refresh());
    expect(result.current.view).toBeNull();
    await act(async () => {
      releaseOlder(row(9, ["Hidden a moment ago."]));
      await older;
    });
    expect(result.current.view).toBeNull();
  });

  it("keeps the view when the read answers with an error", async () => {
    const initial = opened();
    const { result } = await mount(initial);
    state.answer = down;
    await act(() => result.current.refresh());
    await advance(threadLimits.pollDownMilliseconds * 2);
    expect(reads()).toBe(3);
    expect(result.current.view).toBe(initial);
    expect(client.removeChannel).not.toHaveBeenCalled();
  });

  it("keeps the view when the read rejects and tries again on the next tick", async () => {
    const initial = opened();
    const { result } = await mount(initial);
    state.queued.push(() => Promise.reject(new Error("offline")));
    await act(() => result.current.refresh());
    expect(result.current.view).toBe(initial);
    answerWith(row(6, ["Back again."]));
    await advance(threadLimits.pollDownMilliseconds);
    expect(result.current.view?.version).toBe(6);
  });

  it("keeps the view on a malformed answer", async () => {
    const initial = opened();
    const { result } = await mount(initial);
    answerWith({ status: "ok", version: "6" });
    await act(() => result.current.refresh());
    expect(result.current.view).toBe(initial);
  });

  it("resolves a refresh only after its read is applied", async () => {
    const { result } = await mount();
    const release = holdNextRead();
    let settled = false;
    let refreshed = Promise.resolve();
    act(() => {
      refreshed = result.current.refresh().then(() => {
        settled = true;
      });
    });
    await advance(0);
    expect(settled).toBe(false);
    expect(result.current.view?.version).toBe(5);
    await act(async () => {
      release(row(6, ["My own answer."]));
      await refreshed;
    });
    expect(settled).toBe(true);
    expect(result.current.view?.posts.at(-1)?.body).toBe("My own answer.");
  });
});

describe("useThreadLive polling", () => {
  it("reads about every pollDownMilliseconds while not subscribed", async () => {
    await mount();
    await advance(threadLimits.pollDownMilliseconds - 1);
    expect(reads()).toBe(0);
    await advance(1);
    expect(reads()).toBe(1);
    await advance(threadLimits.pollDownMilliseconds);
    expect(reads()).toBe(2);
    expect(lastRead()).toEqual(["thread_view", { target_thread: threadId, known_version: 5 }]);
  });

  it("reads about every pollUpMilliseconds while subscribed", async () => {
    await mount();
    await report(0, "SUBSCRIBED");
    expect(reads()).toBe(1);
    await advance(threadLimits.pollUpMilliseconds - 1);
    expect(reads()).toBe(1);
    await advance(1);
    expect(reads()).toBe(2);
    await advance(threadLimits.pollUpMilliseconds);
    expect(reads()).toBe(3);
  });

  it("stretches and shrinks the wait with the jitter", async () => {
    random = 0;
    await mount();
    await advance(threadLimits.pollDownMilliseconds * (1 - threadLimits.pollJitterRatio) - 1);
    expect(reads()).toBe(0);
    await advance(1);
    expect(reads()).toBe(1);
  });

  it("opens no channel and does not read in a hidden tab, then reads once when it becomes visible", async () => {
    visibility = "hidden";
    await mount();
    await advance(threadLimits.pollDownMilliseconds * 10);
    expect(reads()).toBe(0);
    expect(client.channel).not.toHaveBeenCalled();
    await setVisibility("visible");
    expect(reads()).toBe(1);
    expect(client.channel).toHaveBeenCalledTimes(1);
  });

  it("stops polling and leaves the channel when the tab is hidden", async () => {
    const { result } = await mount();
    await report(0, "SUBSCRIBED");
    await setVisibility("hidden");
    expect(result.current.link).toBe("catching_up");
    expect(client.removeChannel).toHaveBeenCalledWith(state.channels[0]);
    const before = reads();
    await advance(threadLimits.pollUpMilliseconds * 3);
    expect(reads()).toBe(before);
    await setVisibility("visible");
    expect(reads()).toBe(before + 1);
    expect(client.channel).toHaveBeenCalledTimes(2);
  });

  it("leaves live when the browser goes offline and reads at once when it is back", async () => {
    const { result } = await mount();
    await report(0, "SUBSCRIBED");
    expect(result.current.link).toBe("live");
    await send(window, "offline");
    expect(result.current.link).toBe("catching_up");
    const before = reads();
    await advance(threadLimits.pollDownMilliseconds);
    expect(reads()).toBe(before + 1);
    await send(window, "online");
    expect(reads()).toBe(before + 2);
    expect(result.current.link).toBe("live");
  });
});
