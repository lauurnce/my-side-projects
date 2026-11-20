import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const componentsFolder = join(process.cwd(), "src", "components");
const scannedExtensions = [".tsx", ".css"];
const rawHexColour = /(?<!url\(["']?|href=["']|&)#(?:[0-9a-f]{8}|[0-9a-f]{6}|[0-9a-f]{3,4})(?![\w-])/i;

function hasRawHexColour(line: string): boolean {
  return rawHexColour.test(line);
}

function scannedFiles(folder: string): string[] {
  return readdirSync(folder, { withFileTypes: true }).flatMap((entry) => {
    const path = join(folder, entry.name);
    if (entry.isDirectory()) return scannedFiles(path);
    return scannedExtensions.some((extension) => entry.name.endsWith(extension)) ? [path] : [];
  });
}

function offendingLines(file: string): string[] {
  return readFileSync(file, "utf8")
    .split("\n")
    .flatMap((line, index) =>
      hasRawHexColour(line) ? [`${relative(process.cwd(), file)}:${index + 1}: ${line.trim()}`] : [],
    );
}

describe("raw hex colour rule", () => {
  it.each(["color: #FFF;", "color: #fffa;", 'stroke="#2B0609"', "background: #2b060980"])(
    "flags %s",
    (line) => {
      expect(hasRawHexColour(line)).toBe(true);
    },
  );

  it.each(['<a href="#">', 'fill="url(#fade)"', "mask: url(#abc);", "#components", "#feedback", "&#169;"])(
    "allows %s",
    (line) => {
      expect(hasRawHexColour(line)).toBe(false);
    },
  );
});

describe("src/components", () => {
  it("has files to scan", () => {
    expect(scannedFiles(componentsFolder).length).toBeGreaterThan(0);
  });

  it("has no raw hex colours in any .tsx or .css file", () => {
    expect(scannedFiles(componentsFolder).flatMap(offendingLines)).toEqual([]);
  });
});
