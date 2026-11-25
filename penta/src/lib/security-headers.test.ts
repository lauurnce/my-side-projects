import { describe, expect, it } from "vitest";
import { contentSecurityPolicy, securityHeaders } from "./security-headers";

const cloud = "https://abcdefghijkl.supabase.co";

function directive(policy: string, name: string): string[] {
  const found = policy.split("; ").find((part) => part.startsWith(`${name} `));
  return found ? found.split(" ").slice(1) : [];
}

describe("contentSecurityPolicy", () => {
  it("allows the app itself and the Supabase project over https and wss, and nothing else to connect to", () => {
    const policy = contentSecurityPolicy({ supabaseUrl: cloud });
    expect(directive(policy, "default-src")).toEqual(["'self'"]);
    expect(directive(policy, "connect-src")).toEqual(["'self'", cloud, "wss://abcdefghijkl.supabase.co"]);
  });

  it("uses ws for a local http stack", () => {
    const policy = contentSecurityPolicy({ supabaseUrl: "http://127.0.0.1:54321" });
    expect(directive(policy, "connect-src")).toEqual(["'self'", "http://127.0.0.1:54321", "ws://127.0.0.1:54321"]);
  });

  it("keeps the pdf.js worker working: workers from the app and from blobs, wasm allowed, eval not", () => {
    const policy = contentSecurityPolicy({ supabaseUrl: cloud });
    expect(directive(policy, "worker-src")).toEqual(["'self'", "blob:"]);
    expect(directive(policy, "script-src")).toContain("'wasm-unsafe-eval'");
    expect(directive(policy, "script-src")).not.toContain("'unsafe-eval'");
    expect(directive(policy, "script-src").some((source) => source.startsWith("http"))).toBe(false);
  });

  it("allows eval and the reload socket only in development", () => {
    const policy = contentSecurityPolicy({ supabaseUrl: cloud, development: true });
    expect(directive(policy, "script-src")).toContain("'unsafe-eval'");
    expect(directive(policy, "connect-src")).toContain("ws://localhost:*");
  });

  it("blocks frames, plugins, foreign form targets and framing by other sites", () => {
    const policy = contentSecurityPolicy({ supabaseUrl: cloud });
    expect(directive(policy, "frame-src")).toEqual(["'none'"]);
    expect(directive(policy, "object-src")).toEqual(["'none'"]);
    expect(directive(policy, "form-action")).toEqual(["'self'"]);
    expect(directive(policy, "frame-ancestors")).toEqual(["'none'"]);
    expect(directive(policy, "base-uri")).toEqual(["'self'"]);
    expect(directive(policy, "img-src")).toEqual(["'self'", "data:", "blob:"]);
  });

  it("still answers with a closed policy when the Supabase URL is missing or broken", () => {
    for (const supabaseUrl of [undefined, "", "not a url"]) {
      expect(directive(contentSecurityPolicy({ supabaseUrl }), "connect-src")).toEqual(["'self'"]);
    }
  });
});

describe("securityHeaders", () => {
  it("sends the policy with the other hardening headers, and HSTS outside development", () => {
    const names = (development: boolean) => securityHeaders({ supabaseUrl: cloud, development }).map((header) => header.key);
    expect(names(false)).toEqual([
      "Content-Security-Policy",
      "X-Content-Type-Options",
      "X-Frame-Options",
      "Referrer-Policy",
      "Permissions-Policy",
      "Cross-Origin-Opener-Policy",
      "Strict-Transport-Security",
    ]);
    expect(names(true)).not.toContain("Strict-Transport-Security");
  });
});
