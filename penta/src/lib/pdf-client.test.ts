import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const sourceRoot = join(process.cwd(), "src");
const loaderFile = join("lib", "pdf-client.ts");
const pdfImport = /["']pdfjs-dist[^"']*["']/g;
const allowedImports = ['"pdfjs-dist/legacy/build/pdf.mjs"', '"pdfjs-dist/legacy/build/pdf.worker.min.mjs"'];

function sourceFiles(folder: string): string[] {
  return readdirSync(folder, { withFileTypes: true }).flatMap((entry) => {
    const path = join(folder, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx)$/.test(entry.name) && !entry.name.includes(".test.") ? [path] : [];
  });
}

function pdfImportsOf(path: string): string[] {
  return readFileSync(path, "utf8").match(pdfImport) ?? [];
}

describe("pdf.js imports", () => {
  it("loads only the legacy build and the legacy worker", () => {
    const imports = pdfImportsOf(join(sourceRoot, loaderFile));
    expect(imports.length).toBeGreaterThan(0);
    expect(imports.every((value) => allowedImports.includes(value))).toBe(true);
  });

  it("is imported from one file only", () => {
    const others = sourceFiles(sourceRoot).filter(
      (path) => !path.endsWith(loaderFile) && pdfImportsOf(path).length > 0,
    );
    expect(others).toEqual([]);
  });
});
