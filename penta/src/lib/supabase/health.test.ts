import { afterEach, describe, expect, it, vi } from "vitest";
import { isDatabaseReachable } from "@/lib/supabase/health";

function configureDatabase() {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:54321");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "test-key");
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("isDatabaseReachable", () => {
  it("is false and makes no request when the database is not configured", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "");
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    expect(await isDatabaseReachable()).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("is true when the data api answers", async () => {
    configureDatabase();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}")));

    expect(await isDatabaseReachable()).toBe(true);
  });

  it("is false when the data api answers with an error", async () => {
    configureDatabase();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("", { status: 503 })));

    expect(await isDatabaseReachable()).toBe(false);
  });

  it("is false when the request fails", async () => {
    configureDatabase();
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("connection refused")));

    expect(await isDatabaseReachable()).toBe(false);
  });
});
