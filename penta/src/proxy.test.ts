import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

type CookieToSet = { name: string; value: string; options: Record<string, unknown> };
type ClientOptions = {
  cookieOptions: unknown;
  cookies: {
    getAll: () => { name: string; value: string }[];
    setAll: (cookies: CookieToSet[], headers: Record<string, string>) => void;
  };
};
type ClaimsResult = { data: { claims: { sub: string } } | null; error: unknown };

const mocks = vi.hoisted(() => ({
  createServerClient: vi.fn(),
  cookieOptions: { secure: false },
}));

vi.mock("@supabase/ssr", () => ({ createServerClient: mocks.createServerClient }));
vi.mock("@/lib/supabase/server", () => ({ sessionCookieOptions: mocks.cookieOptions }));

import { config, proxy } from "./proxy";

const refreshed: CookieToSet[] = [
  { name: "sb-penta-auth-token", value: "fresh-token", options: { path: "/", httpOnly: true, maxAge: 3600 } },
];
const cacheHeaders = { "Cache-Control": "private, no-store", Expires: "0" };
const signedIn: ClaimsResult = { data: { claims: { sub: "user-1" } }, error: null };
const signedOut: ClaimsResult = { data: null, error: null };

function requestFor(path: string, cookie?: string) {
  return new NextRequest(`http://localhost:3000${path}`, cookie ? { headers: { cookie } } : undefined);
}

function sessionIs(result: ClaimsResult, refresh = false) {
  mocks.createServerClient.mockImplementation((_url: string, _key: string, options: ClientOptions) => ({
    auth: {
      getClaims: async () => {
        if (refresh) options.cookies.setAll(refreshed, cacheHeaders);
        return result;
      },
    },
  }));
}

function sessionCheckThrows() {
  mocks.createServerClient.mockImplementation(() => ({
    auth: {
      getClaims: async () => {
        throw new TypeError("fetch failed");
      },
    },
  }));
}

beforeEach(() => {
  mocks.createServerClient.mockReset();
});

describe("proxy matcher", () => {
  it("covers only the guarded and the guest pages", () => {
    expect(config.matcher).toEqual([
      "/hub/:path*",
      "/classes/:path*",
      "/decks/:path*",
      "/ops/:path*",
      "/grades/:path*",
      "/threads/:path*",
      "/login",
      "/signup",
    ]);
  });
});

describe("proxy without a user", () => {
  it("lets a server action request through so the action can answer for itself", async () => {
    sessionIs(signedOut);
    const request = new NextRequest("http://localhost:3000/threads/abc", { method: "POST", headers: { "next-action": "4f0e" } });
    const response = await proxy(request);
    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
  });

  it("still redirects a plain POST and a GET that carries the action header", async () => {
    sessionIs(signedOut);
    const post = await proxy(new NextRequest("http://localhost:3000/threads/abc", { method: "POST" }));
    const get = await proxy(new NextRequest("http://localhost:3000/threads/abc", { headers: { "next-action": "4f0e" } }));
    expect(post.status).toBe(307);
    expect(get.status).toBe(307);
  });

  it("still answers 503 to a server action when the session cannot be checked", async () => {
    sessionCheckThrows();
    const request = new NextRequest("http://localhost:3000/threads/abc", { method: "POST", headers: { "next-action": "4f0e" } });
    expect((await proxy(request)).status).toBe(503);
  });

  it("redirects a guarded path to the login page with the path and the query as next", async () => {
    sessionIs(signedOut);
    const response = await proxy(requestFor("/classes/abc?tab=people&sort=name"));
    const location = new URL(response.headers.get("location")!);
    expect(response.status).toBe(307);
    expect(location.pathname).toBe("/login");
    expect(location.searchParams.get("next")).toBe("/classes/abc?tab=people&sort=name");
  });

  it("redirects /hub to the login page", async () => {
    sessionIs(signedOut);
    const response = await proxy(requestFor("/hub"));
    expect(response.headers.get("location")).toBe("http://localhost:3000/login?next=%2Fhub");
  });

  it("redirects a deck and its download to the login page", async () => {
    sessionIs(signedOut);
    const page = await proxy(requestFor("/decks/abc"));
    const download = await proxy(requestFor("/decks/abc/download"));
    expect(page.headers.get("location")).toBe("http://localhost:3000/login?next=%2Fdecks%2Fabc");
    expect(download.headers.get("location")).toBe("http://localhost:3000/login?next=%2Fdecks%2Fabc%2Fdownload");
  });

  it("redirects a quiz and an attempt to the login page", async () => {
    sessionIs(signedOut);
    const quiz = await proxy(requestFor("/ops/abc"));
    const attempt = await proxy(requestFor("/ops/abc/attempt/def"));
    expect(quiz.headers.get("location")).toBe("http://localhost:3000/login?next=%2Fops%2Fabc");
    expect(attempt.headers.get("location")).toBe(
      "http://localhost:3000/login?next=%2Fops%2Fabc%2Fattempt%2Fdef",
    );
  });

  it("redirects the grades page to the login page", async () => {
    sessionIs(signedOut);
    const grades = await proxy(requestFor("/grades"));
    expect(grades.headers.get("location")).toBe("http://localhost:3000/login?next=%2Fgrades");
  });

  it("redirects a thread to the login page", async () => {
    sessionIs(signedOut);
    const thread = await proxy(requestFor("/threads/abc"));
    expect(thread.headers.get("location")).toBe("http://localhost:3000/login?next=%2Fthreads%2Fabc");
  });

  it("treats a rejected token as no user", async () => {
    sessionIs({ data: null, error: { name: "AuthApiError", status: 403 } });
    const response = await proxy(requestFor("/classes"));
    expect(new URL(response.headers.get("location")!).pathname).toBe("/login");
  });

  it.each(["/login", "/signup"])("lets %s through", async (path) => {
    sessionIs(signedOut);
    const response = await proxy(requestFor(path));
    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
  });
});

describe("proxy with a user", () => {
  it.each(["/login", "/signup"])("redirects %s to the hub", async (path) => {
    sessionIs(signedIn);
    const response = await proxy(requestFor(path));
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("http://localhost:3000/hub");
  });

  it.each(["/hub", "/classes", "/classes/abc"])("lets %s through", async (path) => {
    sessionIs(signedIn);
    const response = await proxy(requestFor(path));
    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
  });

  it("does not guard a path that only starts like a guarded one", async () => {
    sessionIs(signedOut);
    const response = await proxy(requestFor("/hubris"));
    expect(response.status).toBe(200);
  });
});

describe("proxy when the session check fails", () => {
  it.each(["/hub", "/classes/abc"])("answers %s with 503 and a text body when the check throws", async (path) => {
    sessionCheckThrows();
    const response = await proxy(requestFor(path));
    expect(response.status).toBe(503);
    expect(response.headers.get("location")).toBeNull();
    expect((await response.text()).length).toBeGreaterThan(0);
  });

  it("answers 503 when the client cannot be created", async () => {
    mocks.createServerClient.mockImplementation(() => {
      throw new Error("missing url");
    });
    const response = await proxy(requestFor("/hub"));
    expect(response.status).toBe(503);
  });

  it.each([
    { name: "AuthRetryableFetchError", status: 0, __isAuthError: true },
    { name: "AuthApiError", status: 502, __isAuthError: true },
  ])("answers 503 on a returned $name with status $status", async (error) => {
    sessionIs({ data: null, error });
    const response = await proxy(requestFor("/hub"));
    expect(response.status).toBe(503);
  });

  it("still shows the login page", async () => {
    sessionCheckThrows();
    const response = await proxy(requestFor("/login"));
    expect(response.status).toBe(200);
  });
});

describe("proxy cookies", () => {
  it("creates the client with the session cookie options and the request cookies", async () => {
    sessionIs(signedIn);
    await proxy(requestFor("/hub", "sb-penta-auth-token=old-token"));
    const options = mocks.createServerClient.mock.calls[0][2] as ClientOptions;
    expect(options.cookieOptions).toBe(mocks.cookieOptions);
    expect(options.cookies.getAll()).toEqual([{ name: "sb-penta-auth-token", value: "old-token" }]);
  });

  it("puts refreshed cookies and headers on the response it passes through", async () => {
    sessionIs(signedIn, true);
    const response = await proxy(requestFor("/hub", "sb-penta-auth-token=old-token"));
    const cookie = response.cookies.get("sb-penta-auth-token");
    expect(response.status).toBe(200);
    expect(cookie?.value).toBe("fresh-token");
    expect(cookie?.httpOnly).toBe(true);
    expect(cookie?.maxAge).toBe(3600);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("expires")).toBe("0");
  });

  it("forwards refreshed cookies to the page through the request", async () => {
    sessionIs(signedIn, true);
    const request = requestFor("/hub", "sb-penta-auth-token=old-token");
    const response = await proxy(request);
    expect(request.cookies.get("sb-penta-auth-token")?.value).toBe("fresh-token");
    expect(response.headers.get("x-middleware-request-cookie")).toContain("fresh-token");
  });

  it("carries refreshed cookies and headers on the redirect to the hub", async () => {
    sessionIs(signedIn, true);
    const response = await proxy(requestFor("/login"));
    const cookie = response.cookies.get("sb-penta-auth-token");
    expect(response.headers.get("location")).toBe("http://localhost:3000/hub");
    expect(cookie?.value).toBe("fresh-token");
    expect(cookie?.httpOnly).toBe(true);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });

  it("carries cleared cookies on the redirect to the login page", async () => {
    mocks.createServerClient.mockImplementation((_url: string, _key: string, options: ClientOptions) => ({
      auth: {
        getClaims: async () => {
          options.cookies.setAll([{ name: "sb-penta-auth-token", value: "", options: { path: "/", maxAge: 0 } }], {});
          return signedOut;
        },
      },
    }));
    const response = await proxy(requestFor("/classes", "sb-penta-auth-token=stale"));
    const cookie = response.cookies.get("sb-penta-auth-token");
    expect(new URL(response.headers.get("location")!).pathname).toBe("/login");
    expect(cookie?.value).toBe("");
    expect(cookie?.maxAge).toBe(0);
  });
});
