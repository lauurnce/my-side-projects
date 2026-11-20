import { describe, expect, it } from "vitest";
import { isDatabaseReachable } from "@/lib/supabase/health";

const isConfigured = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
);

describe.skipIf(!isConfigured)("development database", () => {
  it("answers through the data api", async () => {
    expect(await isDatabaseReachable()).toBe(true);
  });
});
