import { describe, expect, it } from "vitest";
import { assertLocalSupabase, isLocalSupabase } from "@/lib/supabase/local";

describe("isLocalSupabase", () => {
  it.each(["http://127.0.0.1:54321", "http://localhost:54321", "http://[::1]:54321"])("accepts %s", (url) => {
    expect(isLocalSupabase(url)).toBe(true);
  });

  it.each([
    undefined,
    "",
    "not a url",
    "https://abcd.supabase.co",
    "http://localhost.evil.com",
    "http://127.0.0.1.nip.io",
    "http://evil.com/?localhost",
    "http://localhost@evil.com",
  ])("refuses %j", (url) => {
    expect(isLocalSupabase(url)).toBe(false);
  });
});

describe("assertLocalSupabase", () => {
  it("returns a local url", () => {
    expect(assertLocalSupabase("http://127.0.0.1:54321")).toBe("http://127.0.0.1:54321");
  });

  it("throws for a cloud project", () => {
    expect(() => assertLocalSupabase("https://abcd.supabase.co")).toThrow(/local development database/);
  });
});
