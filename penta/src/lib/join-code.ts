export function formatJoinCode(code: string): string {
  return `${code.slice(0, 5)}-${code.slice(5)}`;
}
