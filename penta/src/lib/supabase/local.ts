const localHosts = ["127.0.0.1", "localhost", "[::1]"];

export function isLocalSupabase(url: string | undefined): boolean {
  if (!url) return false;
  try {
    return localHosts.includes(new URL(url).hostname);
  } catch {
    return false;
  }
}

export function assertLocalSupabase(url: string | undefined): string {
  if (!url || !isLocalSupabase(url)) {
    throw new Error("This command runs only against the local development database");
  }
  return url;
}
