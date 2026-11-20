import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

type Tokens = Record<string, string>;

const tokensCss = readFileSync(join(process.cwd(), "src", "styles", "tokens.css"), "utf8");

function declarations(block: string): Tokens {
  return Object.fromEntries(
    [...block.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map(([, name, value]) => [name, value.trim()]),
  );
}

function blockFor(selector: RegExp): string {
  const match = tokensCss.match(selector);
  if (!match) throw new Error(`tokens.css has no block for ${selector}`);
  return match[1];
}

const light = declarations(blockFor(/:root,\s*\[data-theme="light"\]\s*\{([^}]*)\}/));
const dark = { ...light, ...declarations(blockFor(/\[data-theme="dark"\]\s*\{([^}]*)\}/)) };

function channels(tokens: Tokens, name: string): number[] {
  const value = tokens[name];
  if (!/^#[0-9a-f]{6}$/i.test(value ?? "")) throw new Error(`${name} is not a six digit hex colour: ${value}`);
  return [1, 3, 5].map((start) => parseInt(value.slice(start, start + 2), 16) / 255);
}

function luminance(tokens: Tokens, name: string): number {
  const [red, green, blue] = channels(tokens, name).map((channel) =>
    channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4,
  );
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function contrast(tokens: Tokens, foreground: string, background: string): number {
  const [lighter, darker] = [luminance(tokens, foreground), luminance(tokens, background)].sort((a, b) => b - a);
  return (lighter + 0.05) / (darker + 0.05);
}

const pairs = [
  { foreground: "--fg", background: "--bg", minimum: 4.5, role: "text" },
  { foreground: "--fg-muted", background: "--bg", minimum: 4.5, role: "labels" },
  { foreground: "--fg-muted", background: "--bg-deep", minimum: 4.5, role: "labels on the deep ground" },
  { foreground: "--fg-soft", background: "--bg", minimum: 3, role: "large display text" },
  { foreground: "--fg-inv", background: "--fg", minimum: 4.5, role: "text on a filled button" },
  { foreground: "--ink", background: "--card", minimum: 4.5, role: "text on a card" },
  { foreground: "--ink", background: "--accent", minimum: 4.5, role: "text on gold" },
  { foreground: "--accent-mark", background: "--bg", minimum: 3, role: "marks and the focus ring" },
  { foreground: "--ink", background: "--card", minimum: 3, role: "the focus ring on a card" },
];

describe("tokens.css", () => {
  it("has different light and dark grounds", () => {
    expect(light["--bg"]).toBe("#F5F0E6");
    expect(dark["--bg"]).toBe("#800000");
  });
});

describe.each([
  { theme: "light", tokens: light },
  { theme: "dark", tokens: dark },
])("contrast in $theme", ({ tokens }) => {
  it.each(pairs)("$foreground on $background is at least $minimum for $role", ({ foreground, background, minimum }) => {
    expect(contrast(tokens, foreground, background)).toBeGreaterThanOrEqual(minimum);
  });
});
