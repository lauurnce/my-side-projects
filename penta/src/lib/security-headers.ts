export type SecurityHeader = { key: string; value: string };

export type SecurityOptions = { supabaseUrl?: string; development?: boolean };

function supabaseSources(supabaseUrl: string | undefined): string[] {
  if (!supabaseUrl) return [];
  try {
    const { origin, host, protocol } = new URL(supabaseUrl);
    return [origin, `${protocol === "https:" ? "wss" : "ws"}://${host}`];
  } catch {
    return [];
  }
}

export function contentSecurityPolicy({ supabaseUrl, development = false }: SecurityOptions): string {
  const scripts = ["'self'", "'unsafe-inline'", "'wasm-unsafe-eval'", ...(development ? ["'unsafe-eval'"] : [])];
  const connections = ["'self'", ...supabaseSources(supabaseUrl), ...(development ? ["ws://localhost:*"] : [])];

  return [
    "default-src 'self'",
    `script-src ${scripts.join(" ")}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    `connect-src ${connections.join(" ")}`,
    "worker-src 'self' blob:",
    "frame-src 'none'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; ");
}

export function securityHeaders(options: SecurityOptions): SecurityHeader[] {
  return [
    { key: "Content-Security-Policy", value: contentSecurityPolicy(options) },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "X-Frame-Options", value: "DENY" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
    { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
    ...(options.development ? [] : [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" }]),
  ];
}
