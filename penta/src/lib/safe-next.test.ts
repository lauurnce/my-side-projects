import { describe, expect, it } from "vitest";
import { safeNext } from "@/lib/safe-next";

describe("safeNext", () => {
  it.each([
    ["/hub", "/hub"],
    ["/classes", "/classes"],
    ["/classes/123?tab=roster", "/classes/123?tab=roster"],
    ["/hub/", "/hub/"],
  ])("keeps %s", (value, expected) => {
    expect(safeNext(value)).toBe(expected);
  });

  it.each([
    undefined,
    null,
    42,
    "",
    "hub",
    "//evil.com",
    "/\\evil.com",
    "/\t/evil.com",
    "/\n/evil.com",
    "/%2F%2Fevil.com",
    "https://evil.com/hub",
    "javascript:alert(1)",
    "/login",
    "/login?next=/login",
    "/signup",
    "/api/health",
    "/hubris",
    "/classes/../login",
    "/hub/../../api/health",
    `/hub?${"a".repeat(600)}`,
  ])("falls back to the hub for %j", (value) => {
    expect(safeNext(value)).toBe("/hub");
  });
});
