import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook } from "@testing-library/react";
import { useSeenSlides, type SeenSlidesOptions } from "./useSeenSlides";

let visibility: DocumentVisibilityState = "visible";

function setVisibility(next: DocumentVisibilityState) {
  visibility = next;
  document.dispatchEvent(new Event("visibilitychange"));
}

async function advance(milliseconds: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(milliseconds);
  });
}

function options(overrides: Partial<SeenSlidesOptions> = {}): SeenSlidesOptions {
  return {
    enabled: true,
    initial: [],
    slide: 1,
    painted: true,
    limit: 5,
    record: vi.fn().mockResolvedValue(true),
    ...overrides,
  };
}

function mount(first: SeenSlidesOptions) {
  return renderHook((props: SeenSlidesOptions) => useSeenSlides(props), { initialProps: first });
}

beforeEach(() => {
  vi.useFakeTimers();
  visibility = "visible";
  vi.spyOn(document, "visibilityState", "get").mockImplementation(() => visibility);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("useSeenSlides", () => {
  it("records a slide after one second and adds it to the set", async () => {
    const props = options();
    const { result } = mount(props);

    await advance(999);
    expect(props.record).not.toHaveBeenCalled();
    await advance(1);
    expect(props.record).toHaveBeenCalledWith(1);
    expect(result.current.has(1)).toBe(true);
  });

  it("records nothing when the slide changes before one second", async () => {
    const props = options();
    const { rerender, result } = mount(props);

    await advance(600);
    rerender({ ...props, slide: 2 });
    await advance(600);
    expect(props.record).not.toHaveBeenCalled();
    await advance(400);
    expect(props.record).toHaveBeenCalledTimes(1);
    expect(props.record).toHaveBeenCalledWith(2);
    expect([...result.current]).toEqual([2]);
  });

  it("waits until the slide has painted", async () => {
    const props = options({ painted: false });
    const { rerender } = mount(props);

    await advance(3000);
    expect(props.record).not.toHaveBeenCalled();
    rerender({ ...props, painted: true });
    await advance(1000);
    expect(props.record).toHaveBeenCalledWith(1);
  });

  it("restarts the timer when the tab is hidden and shown again", async () => {
    const props = options();
    mount(props);

    await advance(800);
    act(() => setVisibility("hidden"));
    await advance(5000);
    expect(props.record).not.toHaveBeenCalled();
    act(() => setVisibility("visible"));
    await advance(999);
    expect(props.record).not.toHaveBeenCalled();
    await advance(1);
    expect(props.record).toHaveBeenCalledTimes(1);
  });

  it("does not start while the tab is hidden", async () => {
    visibility = "hidden";
    const props = options();
    mount(props);

    await advance(3000);
    expect(props.record).not.toHaveBeenCalled();
  });

  it("sends a seeded or recorded slide only once", async () => {
    const props = options({ initial: [1] });
    const { rerender, result } = mount(props);

    await advance(2000);
    expect(props.record).not.toHaveBeenCalled();
    rerender({ ...props, slide: 2 });
    await advance(1000);
    rerender({ ...props, slide: 1 });
    await advance(1000);
    rerender({ ...props, slide: 2 });
    await advance(2000);
    expect(props.record).toHaveBeenCalledTimes(1);
    expect([...result.current].sort()).toEqual([1, 2]);
  });

  it("leaves a failed slide unrecorded and tries again on a later visit", async () => {
    const record = vi.fn().mockResolvedValueOnce(false).mockRejectedValueOnce(new Error("offline")).mockResolvedValue(true);
    const props = options({ record });
    const { rerender, result } = mount(props);

    await advance(1000);
    expect(result.current.has(1)).toBe(false);
    await advance(5000);
    expect(record).toHaveBeenCalledTimes(1);

    rerender({ ...props, slide: 2 });
    await advance(1000);
    expect(result.current.has(2)).toBe(false);

    rerender({ ...props, slide: 1 });
    await advance(1000);
    expect(record).toHaveBeenCalledTimes(3);
    expect(result.current.has(1)).toBe(true);
  });

  it("never records above the stored slide count", async () => {
    const props = options({ slide: 6, limit: 5 });
    mount(props);

    await advance(3000);
    expect(props.record).not.toHaveBeenCalled();
  });

  it("records nothing for a teacher", async () => {
    const props = options({ enabled: false });
    mount(props);

    await advance(3000);
    expect(props.record).not.toHaveBeenCalled();
  });
});
