import { describe, expect, it } from "vitest";
import { csvCell, csvFile } from "@/lib/csv";

describe("csv cell", () => {
  it("exports a name that starts with = as text", () => {
    expect(csvCell("=1+1")).toBe(`"'=1+1"`);
    expect(csvCell('=HYPERLINK("http://x","y")')).toBe(`"'=HYPERLINK(""http://x"",""y"")"`);
  });

  it.each(["+1", "-Anne", "@SUM(A1)", "=cmd|' /C calc'!A0"])("guards %s", (value) => {
    expect(csvCell(value).startsWith(`"'`)).toBe(true);
  });

  it("guards a formula hidden behind spaces, a tab or hidden characters", () => {
    expect(csvCell(" =1+1")).toBe(`"' =1+1"`);
    expect(csvCell("\t=1")).toBe(`"'\t=1"`);
    expect(csvCell("‮=1")).toBe(`"'‮=1"`);
    expect(csvCell("​+1")).toBe(`"'​+1"`);
  });

  it("guards the full width signs", () => {
    expect(csvCell("＝1")).toBe(`"'＝1"`);
    expect(csvCell("＋1")).toBe(`"'＋1"`);
  });

  it("guards text that starts with a line break", () => {
    expect(csvCell("\nplain")).toBe(`"' plain"`);
  });

  it("leaves ordinary text alone", () => {
    expect(csvCell("Ana Reyes")).toBe('"Ana Reyes"');
    expect(csvCell("Dela Cruz-Santos")).toBe('"Dela Cruz-Santos"');
    expect(csvCell("a=b")).toBe('"a=b"');
    expect(csvCell("")).toBe('""');
  });

  it("quotes quotes, commas and line breaks", () => {
    expect(csvCell('a"b,c\nd')).toBe('"a""b,c d"');
    expect(csvCell("line one\r\nline two")).toBe('"line one line two"');
  });

  it("keeps numbers as numbers and never exempts numeric text", () => {
    expect(csvCell(18)).toBe("18");
    expect(csvCell(-3)).toBe("-3");
    expect(csvCell(66.5)).toBe("66.5");
    expect(csvCell("-3")).toBe(`"'-3"`);
    expect(csvCell(Number.NaN)).toBe('""');
  });

  it("writes an empty quoted cell for nothing", () => {
    expect(csvCell(null)).toBe('""');
  });

  it("drops control characters", () => {
    expect(csvCell("a\u0000b\u0007c")).toBe('"abc"');
  });
});

describe("csv file", () => {
  it("starts with a byte order mark and ends every row with a line break", () => {
    const file = csvFile([
      ["Student", "Score"],
      ["Peña, Ana", 18],
    ]);
    expect(file.charCodeAt(0)).toBe(0xfeff);
    expect(Array.from(new TextEncoder().encode(file).slice(0, 3))).toEqual([0xef, 0xbb, 0xbf]);
    expect(file.slice(1)).toBe('"Student","Score"\r\n"Peña, Ana",18\r\n');
  });
});
