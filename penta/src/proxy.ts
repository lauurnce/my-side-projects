import { createServerClient } from "@supabase/ssr";
import { isAuthRetryableFetchError } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { sessionCookieOptions } from "@/lib/supabase/server";

const guardedRoots = ["/hub", "/classes", "/decks"];
const guestOnlyPaths = ["/login", "/signup"];

type SessionCheck = "user" | "guest" | "unavailable";

function isGuarded(pathname: string): boolean {
  return guardedRoots.some((root) => pathname === root || pathname.startsWith(`${root}/`));
}

function isServerFailure(error: unknown): boolean {
  if (isAuthRetryableFetchError(error)) return true;
  const status = (error as { status?: unknown }).status;
  return typeof status === "number" && status >= 500;
}

function unavailable(): NextResponse {
  return new NextResponse("PENTA cannot check your session right now. Try again in a moment.", {
    status: 503,
    headers: { "Cache-Control": "no-store", "Content-Type": "text/plain; charset=utf-8", "Retry-After": "10" },
  });
}

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  let sessionHeaders: Record<string, string> = {};

  function redirectTo(url: URL): NextResponse {
    const redirect = NextResponse.redirect(url);
    for (const cookie of response.cookies.getAll()) redirect.cookies.set(cookie);
    for (const [name, value] of Object.entries(sessionHeaders)) redirect.headers.set(name, value);
    return redirect;
  }

  async function checkSession(): Promise<SessionCheck> {
    try {
      const supabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
          cookieOptions: sessionCookieOptions,
          cookies: {
            getAll: () => request.cookies.getAll(),
            setAll: (cookiesToSet, headers) => {
              for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
              response = NextResponse.next({ request });
              for (const { name, value, options } of cookiesToSet) response.cookies.set(name, value, options);
              sessionHeaders = { ...sessionHeaders, ...headers };
              for (const [name, value] of Object.entries(sessionHeaders)) response.headers.set(name, value);
            },
          },
        },
      );
      const { data, error } = await supabase.auth.getClaims();
      if (data?.claims.sub) return "user";
      return error && isServerFailure(error) ? "unavailable" : "guest";
    } catch {
      return "unavailable";
    }
  }

  const session = await checkSession();
  const { pathname, search } = request.nextUrl;

  if (isGuarded(pathname) && session === "unavailable") return unavailable();

  if (isGuarded(pathname) && session === "guest") {
    const login = new URL("/login", request.url);
    login.searchParams.set("next", `${pathname}${search}`);
    return redirectTo(login);
  }

  if (guestOnlyPaths.includes(pathname) && session === "user") return redirectTo(new URL("/hub", request.url));

  return response;
}

export const config = { matcher: ["/hub/:path*", "/classes/:path*", "/decks/:path*", "/login", "/signup"] };
