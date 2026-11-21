export type RangeResponse = { status: number; arrayBuffer: () => Promise<ArrayBuffer> };

export type RangeFetch = (url: string, init: { headers: { Range: string } }) => Promise<RangeResponse>;

export type RefreshUrl = () => Promise<string | null>;

export type RangeReader = (begin: number, end: number) => Promise<Uint8Array>;

export function rangeHeader(begin: number, end: number): string {
  return `bytes=${begin}-${end - 1}`;
}

async function readOnce(fetchRange: RangeFetch, url: string, begin: number, end: number): Promise<Uint8Array | null> {
  try {
    const response = await fetchRange(url, { headers: { Range: rangeHeader(begin, end) } });
    if (response.status !== 206) return null;
    return new Uint8Array(await response.arrayBuffer());
  } catch {
    return null;
  }
}

export function createRangeReader(firstUrl: string, fetchRange: RangeFetch, refresh: RefreshUrl): RangeReader {
  let url = firstUrl;
  let refreshing: Promise<string | null> | null = null;

  function urlAfter(failedUrl: string): Promise<string | null> {
    if (url !== failedUrl) return Promise.resolve(url);
    refreshing ??= refresh()
      .catch(() => null)
      .then((fresh) => {
        refreshing = null;
        if (fresh) url = fresh;
        return fresh;
      });
    return refreshing;
  }

  return async function readRange(begin, end) {
    const firstTry = url;
    const chunk = await readOnce(fetchRange, firstTry, begin, end);
    if (chunk) return chunk;

    const fresh = await urlAfter(firstTry);
    if (!fresh) throw new Error("The deck file could not be refreshed.");

    const retried = await readOnce(fetchRange, fresh, begin, end);
    if (!retried) throw new Error("The deck file could not be read.");
    return retried;
  };
}
