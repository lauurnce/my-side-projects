const fallbackPath = "/hub";
const allowedRoots = ["/hub", "/classes"];
const parsingOrigin = "http://penta.invalid";
const unsafeCharacters = /[\\\u0000-\u001f\u007f]/;

function isUnderAllowedRoot(pathname: string): boolean {
  return allowedRoots.some((root) => pathname === root || pathname.startsWith(`${root}/`));
}

export function safeNext(value: unknown): string {
  if (typeof value !== "string" || value.length > 512) return fallbackPath;
  if (unsafeCharacters.test(value)) return fallbackPath;
  if (!value.startsWith("/") || value.startsWith("//")) return fallbackPath;

  const url = new URL(value, parsingOrigin);
  if (url.origin !== parsingOrigin) return fallbackPath;
  if (!isUnderAllowedRoot(url.pathname)) return fallbackPath;
  return `${url.pathname}${url.search}`;
}
