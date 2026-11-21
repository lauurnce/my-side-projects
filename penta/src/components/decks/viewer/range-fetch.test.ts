import { describe, expect, it, vi } from "vitest";
import { createRangeReader, rangeHeader, type RangeResponse } from "./range-fetch";

function response(status: number, bytes: number[] = []): RangeResponse {
  return { status, arrayBuffer: async () => new Uint8Array(bytes).buffer };
}

describe("rangeHeader", () => {
  it("turns an exclusive end into an inclusive one", () => {
    expect(rangeHeader(0, 262144)).toBe("bytes=0-262143");
  });
});

describe("createRangeReader", () => {
  it("returns the bytes of a 206 answer", async () => {
    const fetchRange = vi.fn().mockResolvedValue(response(206, [1, 2, 3]));
    const refresh = vi.fn();
    const read = createRangeReader("https://storage.test/a", fetchRange, refresh);

    expect(await read(10, 13)).toEqual(new Uint8Array([1, 2, 3]));
    expect(fetchRange).toHaveBeenCalledWith("https://storage.test/a", { headers: { Range: "bytes=10-12" } });
    expect(refresh).not.toHaveBeenCalled();
  });

  it("refreshes once after a 400 and retries the same range", async () => {
    const fetchRange = vi.fn().mockResolvedValueOnce(response(400)).mockResolvedValueOnce(response(206, [7]));
    const refresh = vi.fn().mockResolvedValue("https://storage.test/b");
    const read = createRangeReader("https://storage.test/a", fetchRange, refresh);

    expect(await read(5, 6)).toEqual(new Uint8Array([7]));
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(fetchRange).toHaveBeenLastCalledWith("https://storage.test/b", { headers: { Range: "bytes=5-5" } });
  });

  it("keeps using the fresh address afterwards", async () => {
    const fetchRange = vi
      .fn()
      .mockResolvedValueOnce(response(400))
      .mockResolvedValue(response(206, [7]));
    const refresh = vi.fn().mockResolvedValue("https://storage.test/b");
    const read = createRangeReader("https://storage.test/a", fetchRange, refresh);

    await read(0, 1);
    await read(1, 2);
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(fetchRange).toHaveBeenLastCalledWith("https://storage.test/b", { headers: { Range: "bytes=1-1" } });
  });

  it("shares one refresh between ranges that fail together", async () => {
    const fetchRange = vi.fn(async (url: string) => response(url.endsWith("/a") ? 400 : 206, [9]));
    const refresh = vi.fn().mockResolvedValue("https://storage.test/b");
    const read = createRangeReader("https://storage.test/a", fetchRange, refresh);

    await Promise.all([read(0, 1), read(1, 2), read(2, 3)]);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("treats a full 200 answer as a failure", async () => {
    const fetchRange = vi.fn().mockResolvedValue(response(200, [1]));
    const refresh = vi.fn().mockResolvedValue("https://storage.test/b");
    const read = createRangeReader("https://storage.test/a", fetchRange, refresh);

    await expect(read(0, 1)).rejects.toThrow();
  });

  it("rejects after two failures", async () => {
    const fetchRange = vi.fn().mockResolvedValue(response(400));
    const refresh = vi.fn().mockResolvedValue("https://storage.test/b");
    const read = createRangeReader("https://storage.test/a", fetchRange, refresh);

    await expect(read(0, 1)).rejects.toThrow();
    expect(fetchRange).toHaveBeenCalledTimes(2);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("rejects when the refresh returns nothing", async () => {
    const fetchRange = vi.fn().mockResolvedValue(response(400));
    const refresh = vi.fn().mockResolvedValue(null);
    const read = createRangeReader("https://storage.test/a", fetchRange, refresh);

    await expect(read(0, 1)).rejects.toThrow();
    expect(fetchRange).toHaveBeenCalledTimes(1);
  });

  it("rejects when the refresh itself fails", async () => {
    const fetchRange = vi.fn().mockRejectedValue(new Error("offline"));
    const refresh = vi.fn().mockRejectedValue(new Error("offline"));
    const read = createRangeReader("https://storage.test/a", fetchRange, refresh);

    await expect(read(0, 1)).rejects.toThrow();
  });
});
