import { afterEach, describe, expect, it, vi } from "vitest";
import { applyStoredTheme, oppositeTheme, parseTheme, storedTheme, switchTheme, themeBootScript, themeCookie } from "@/lib/theme";

function rootWithTheme(theme?: string) {
  const root = document.createElement("html");
  if (theme) root.dataset.theme = theme;
  return root;
}

describe("parseTheme", () => {
  it("defaults to light for a new visitor", () => {
    expect(parseTheme(undefined)).toBe("light");
  });

  it("reads dark only from the exact value", () => {
    expect(parseTheme("dark")).toBe("dark");
  });

  it.each(["", "DARK", " dark", "system", 'dark" onload="'])("treats %j as light", (value) => {
    expect(parseTheme(value)).toBe("light");
  });
});

describe("oppositeTheme", () => {
  it("flips both ways", () => {
    expect(oppositeTheme("light")).toBe("dark");
    expect(oppositeTheme("dark")).toBe("light");
  });
});

describe("themeCookie", () => {
  it("writes a year-long cookie for the whole site", () => {
    expect(themeCookie("dark")).toBe("penta-theme=dark; Path=/; Max-Age=31536000; SameSite=Lax");
  });
});

describe("switchTheme", () => {
  it("turns a light page dark and saves the choice", () => {
    const root = rootWithTheme();
    const jar = { cookie: "" };

    expect(switchTheme(root, jar)).toBe("dark");
    expect(root.dataset.theme).toBe("dark");
    expect(jar.cookie).toContain("penta-theme=dark");
  });

  it("turns a dark page light and saves the choice", () => {
    const root = rootWithTheme("dark");
    const jar = { cookie: "" };

    expect(switchTheme(root, jar)).toBe("light");
    expect(root.dataset.theme).toBe("light");
    expect(jar.cookie).toContain("penta-theme=light");
  });

  it("still switches when cookies cannot be written", () => {
    const root = rootWithTheme();
    const blockedJar = {
      set cookie(_value: string) {
        throw new Error("blocked");
      },
    };

    expect(switchTheme(root, blockedJar)).toBe("dark");
    expect(root.dataset.theme).toBe("dark");
  });
});

describe("themeBootScript", () => {
  function bootWithCookie(cookie: string) {
    vi.spyOn(document, "cookie", "get").mockReturnValue(cookie);
    document.documentElement.dataset.theme = "light";
    new Function(themeBootScript)();
    return document.documentElement.dataset.theme;
  }

  afterEach(() => {
    vi.restoreAllMocks();
    delete document.documentElement.dataset.theme;
  });

  it("leaves a new visitor on light", () => {
    expect(bootWithCookie("")).toBe("light");
  });

  it("sets dark from the saved cookie", () => {
    expect(bootWithCookie("penta-theme=dark")).toBe("dark");
    expect(bootWithCookie("session=abc; penta-theme=dark; other=1")).toBe("dark");
  });

  it.each(["penta-theme=light", "penta-theme=darker", "xpenta-theme=dark", "penta-theme=DARK"])(
    "stays light for %j",
    (cookie) => {
      expect(bootWithCookie(cookie)).toBe("light");
    },
  );

  it("stays light when cookies cannot be read", () => {
    vi.spyOn(document, "cookie", "get").mockImplementation(() => {
      throw new Error("blocked");
    });
    document.documentElement.dataset.theme = "light";
    new Function(themeBootScript)();
    expect(document.documentElement.dataset.theme).toBe("light");
  });
});

describe("applyStoredTheme", () => {
  it("puts the stored theme back on a page that rendered without it", () => {
    const root = document.createElement("html");
    root.dataset.theme = "light";
    applyStoredTheme(root, "other=1; penta-theme=dark; sb-token=abc");
    expect(root.dataset.theme).toBe("dark");
    applyStoredTheme(root, "penta-theme=light");
    expect(root.dataset.theme).toBe("light");
  });

  it("falls back to light with no cookie, an unknown value or a cookie that only looks alike", () => {
    for (const cookies of ["", "penta-theme=sepia", "not-penta-theme=dark", "penta-theme-old=dark"]) {
      expect(storedTheme(cookies)).toBe("light");
    }
    expect(storedTheme("penta-theme=dark")).toBe("dark");
  });
});
