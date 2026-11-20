import { describe, expect, it } from "vitest";
import { oppositeTheme, parseTheme, switchTheme, themeCookie } from "@/lib/theme";

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
