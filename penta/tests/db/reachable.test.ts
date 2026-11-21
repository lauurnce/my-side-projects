import { describe, expect, it } from "vitest";
import { isDatabaseReachable } from "@/lib/supabase/health";

describe("development database", () => {
  it("answers through the data api", async () => {
    expect(await isDatabaseReachable()).toBe(true);
  });
});
