export type CsvValue = string | number | null;

const controls = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;
const lineBreaks = /\r\n?|\n/g;
const formulaStart = /^[\s​-‏‪-‮⁠-⁩﻿]*[=+\-@＝＋－＠]/;
const riskyFirstCharacter = /^[\t\r\n]/;

export function csvCell(value: CsvValue): string {
  if (value === null) return '""';
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : '""';
  const flat = value.replace(controls, "").replace(lineBreaks, " ");
  const risky = riskyFirstCharacter.test(value) || formulaStart.test(flat);
  return `"${(risky ? `'${flat}` : flat).replaceAll('"', '""')}"`;
}

export function csvFile(rows: CsvValue[][]): string {
  return `﻿${rows.map((row) => row.map(csvCell).join(",")).join("\r\n")}\r\n`;
}
