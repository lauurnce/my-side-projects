import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook } from "@testing-library/react";
import { liveLimits } from "@/lib/config";
import { noLive, type LiveState } from "@/lib/live";
import { presenterProblems, usePresenter, type PresenterOptions } from "./usePresenter";

type Answer = { data: unknown; error: unknown; status?: number };
type Call = { name: string; args: Record<string, unknown>; settle: (answer: Answer) => void };

const calls: Call[] = [];

const rpc = vi.fn((name: string, args: Record<string, unknown>) => {
  let settle: (answer: Answer) => void = () => {};
  const pending = new Promise<Answer>((resolve) => {
    settle = resolve;
  });
  calls.push({ name, args, settle });
  return Object.assign(pending, { abortSignal: () => pending });
});

vi.mock("@/lib/supabase/client", () => ({ createClient: () => ({ rpc }) }));

const deckId = "deck-1";
const sessionId = "session-1";

function running(slide: number, revision: number): LiveState {
  return { sessionId, slide, revision, running: true };
}

function options(overrides: Partial<PresenterOptions> = {}): PresenterOptions {
  return {
    deckId,
    enabled: true,
    live: running(4, 10),
    slide: 4,
    read: vi.fn().mockResolvedValue(undefined),
    adopt: vi.fn(),
    ...overrides,
  };
}

function mount(first: PresenterOptions) {
  return renderHook((props: PresenterOptions) => usePresenter(props), { initialProps: first });
}

function callsTo(name: string): Call[] {
  return calls.filter((call) => call.name === name);
}

async function advance(milliseconds: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(milliseconds);
  });
}

async function answer(call: Call, data: unknown, error: unknown = null) {
  call.settle({ data, error });
  await advance(0);
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-27T02:00:00Z"));
  calls.length = 0;
  rpc.mockClear();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("usePresenter presenting", () => {
  it("is true for an enabled owner with a running session", () => {
    expect(mount(options()).result.current.presenting).toBe(true);
  });

  it.each([
    ["the viewer is not the owner", { enabled: false }],
    ["no session exists", { live: noLive }],
    ["the session has ended", { live: { ...running(4, 10), running: false } }],
    ["the running state has no session id", { live: { ...running(4, 10), sessionId: null } }],
  ])("is false when %s", (_label, overrides) => {
    expect(mount(options(overrides)).result.current.presenting).toBe(false);
  });

  it("hides unsent when not presenting", () => {
    expect(mount(options({ enabled: false })).result.current.unsent).toBe(false);
  });
});

describe("usePresenter present", () => {
  it("calls start_live with the deck and slide and then reads", async () => {
    const props = options({ live: noLive, slide: 3 });
    const { result } = mount(props);

    act(() => result.current.present());
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("start_live", { target_deck: deckId, slide: 3 });
    expect(result.current.busy).toBe(true);
    expect(props.read).not.toHaveBeenCalled();

    await answer(calls[0], { status: "started", session_id: sessionId });
    expect(props.read).toHaveBeenCalledTimes(1);
    expect(result.current.busy).toBe(false);
  });

  it("does not start twice while busy", () => {
    const { result } = mount(options({ live: noLive }));
    act(() => result.current.present());
    act(() => result.current.present());
    expect(callsTo("start_live")).toHaveLength(1);
  });

  it("does nothing for a viewer who is not the owner", () => {
    const { result } = mount(options({ enabled: false, live: noLive }));
    act(() => result.current.present());
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe("usePresenter end", () => {
  it("calls end_live with the session and then reads", async () => {
    const props = options();
    const { result } = mount(props);

    act(() => result.current.end());
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("end_live", { target_session: sessionId });
    expect(result.current.busy).toBe(true);
    expect(props.read).not.toHaveBeenCalled();

    await answer(calls[0], "ended");
    expect(props.read).toHaveBeenCalledTimes(1);
    expect(result.current.busy).toBe(false);
  });

  it("does nothing without a running session", () => {
    const { result } = mount(options({ live: noLive }));
    act(() => result.current.end());
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe("usePresenter move", () => {
  it("sends move_live with the session and slide while presenting", () => {
    const { result } = mount(options());
    act(() => result.current.move(5));
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("move_live", { target_session: sessionId, slide: 5 });
  });

  it.each([
    ["the viewer is not the owner", { enabled: false }],
    ["no session is running", { live: noLive }],
  ])("does nothing when %s", async (_label, overrides) => {
    const { result } = mount(options(overrides));
    act(() => result.current.move(5));
    await advance(liveLimits.moveRetryMilliseconds);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("reads when move_live answers ended", async () => {
    const props = options();
    const { result } = mount(props);
    act(() => result.current.move(5));
    await answer(calls[0], { status: "ended" });
    expect(props.read).toHaveBeenCalledTimes(1);
  });

  it("reads when move_live answers refused", async () => {
    const props = options();
    const { result } = mount(props);
    act(() => result.current.move(5));
    await answer(calls[0], { status: "refused" });
    expect(props.read).toHaveBeenCalledTimes(1);
  });

  it("retries a move that comes back with an error and does not read", async () => {
    const props = options();
    const { result } = mount(props);
    act(() => result.current.move(5));
    await answer(calls[0], null, { message: "timeout" });
    await advance(liveLimits.moveRetryMilliseconds);
    expect(callsTo("move_live").map((call) => call.args.slide)).toEqual([5, 5]);
    expect(props.read).not.toHaveBeenCalled();
  });

  it("reports unsent after the notice delay and clears it once sent", async () => {
    const { result } = mount(options());
    act(() => result.current.move(5));
    await advance(liveLimits.unsentNoticeMilliseconds);
    expect(result.current.unsent).toBe(true);
    await answer(calls[0], { status: "moved", revision: 11 });
    expect(result.current.unsent).toBe(false);
  });
});

describe("usePresenter remote slide", () => {
  it("adopts a remote slide with a newer revision when the queue is idle", () => {
    const props = options();
    const { rerender } = mount(props);
    expect(props.adopt).not.toHaveBeenCalled();

    rerender({ ...props, live: running(9, 20) });
    expect(props.adopt).toHaveBeenCalledTimes(1);
    expect(props.adopt).toHaveBeenCalledWith(9);
  });

  it("does not adopt when the viewer is not presenting", () => {
    const props = options({ enabled: false });
    const { rerender } = mount(props);
    rerender({ ...props, live: running(9, 20) });
    expect(props.adopt).not.toHaveBeenCalled();
  });

  it("does not adopt a remote slide at or below its own revision", async () => {
    const props = options();
    const { result, rerender } = mount(props);
    act(() => result.current.move(6));
    await answer(calls[0], { status: "moved", revision: 30 });

    rerender({ ...props, slide: 6, live: running(2, 30) });
    rerender({ ...props, slide: 6, live: running(3, 29) });
    expect(props.adopt).not.toHaveBeenCalled();
  });

  it("does not adopt its own echo while a newer move is pending", async () => {
    const props = options();
    const { result, rerender } = mount(props);

    act(() => {
      result.current.move(5);
      result.current.move(6);
      result.current.move(7);
    });
    const atSeven = { ...props, slide: 7 };
    rerender(atSeven);
    expect(callsTo("move_live").map((call) => call.args.slide)).toEqual([5]);

    rerender({ ...atSeven, live: running(5, 11) });
    expect(props.adopt).not.toHaveBeenCalled();

    await answer(calls[0], { status: "moved", revision: 11 });
    rerender({ ...atSeven, live: running(5, 11) });
    expect(props.adopt).not.toHaveBeenCalled();

    await advance(liveLimits.moveGapMilliseconds);
    expect(callsTo("move_live").map((call) => call.args.slide)).toEqual([5, 7]);
    rerender({ ...atSeven, live: { ...running(5, 11) } });
    expect(props.adopt).not.toHaveBeenCalled();

    await answer(calls[1], { status: "moved", revision: 12 });
    rerender({ ...atSeven, live: running(7, 12) });
    expect(props.adopt).not.toHaveBeenCalled();
  });

  it("adopts a move from another tab after its own moves are confirmed", async () => {
    const props = options();
    const { result, rerender } = mount(props);
    act(() => result.current.move(5));
    await answer(calls[0], { status: "moved", revision: 11 });

    rerender({ ...props, slide: 5, live: running(8, 12) });
    expect(props.adopt).toHaveBeenCalledTimes(1);
    expect(props.adopt).toHaveBeenCalledWith(8);
  });

  it("known bug: adopts a newer move from another tab that arrived while its own older move was in flight", async () => {
    const props = options();
    const { result, rerender } = mount(props);
    act(() => result.current.move(5));
    const atFive = { ...props, slide: 5, live: running(8, 12) };

    rerender(atFive);
    expect(props.adopt).not.toHaveBeenCalled();

    await answer(calls[0], { status: "moved", revision: 11 });
    rerender(atFive);
    expect(props.adopt).toHaveBeenCalledWith(8);
  });
});

describe("usePresenter heartbeat", () => {
  it("calls touch_live after the heartbeat interval and keeps going while open", async () => {
    const props = options();
    mount(props);

    await advance(liveLimits.heartbeatMilliseconds - 1);
    expect(rpc).not.toHaveBeenCalled();
    await advance(1);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("touch_live", { target_session: sessionId });

    await answer(calls[0], "open");
    expect(props.read).not.toHaveBeenCalled();
  });

  it.each(["ended", "refused", null])("reads when touch_live answers %s", async (data) => {
    const props = options();
    mount(props);
    await advance(liveLimits.heartbeatMilliseconds);
    await answer(calls[0], data);
    expect(props.read).toHaveBeenCalledTimes(1);
  });

  it("sends no heartbeat when not presenting", async () => {
    mount(options({ live: noLive }));
    await advance(2 * liveLimits.heartbeatMilliseconds);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("stops the heartbeat after unmount", async () => {
    const { unmount } = mount(options());
    unmount();
    await advance(2 * liveLimits.heartbeatMilliseconds);
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe("usePresenter after the teacher is signed out", () => {
  it("stops retrying a slide move and says the teacher is signed out", async () => {
    const { result } = mount(options());
    act(() => result.current.move(5));
    await advance(liveLimits.moveGapMilliseconds);
    const sent = calls.filter((call) => call.name === "move_live");
    expect(sent).toHaveLength(1);
    sent[0].settle({ data: null, error: { message: "JWT expired" }, status: 401 });
    await advance(liveLimits.moveRetryMilliseconds * 5);
    expect(calls.filter((call) => call.name === "move_live")).toHaveLength(1);
    expect(result.current.problem).toBe(presenterProblems.signedOut);
  });

  it("says so when the session could not be ended, and clears it once it ends", async () => {
    const { result } = mount(options());
    act(() => result.current.end());
    await answer(calls[0], null, { message: "JWT expired" });
    expect(result.current.problem).toBe(presenterProblems.endFailed);
    act(() => result.current.end());
    await answer(calls[1], "ended");
    expect(result.current.problem).toBeNull();
  });
});
