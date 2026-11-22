const inputShape = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/;
const manilaOffsetMilliseconds = 8 * 60 * 60 * 1000;

function toDate(value: string | Date | null | undefined): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function isoToManilaInput(iso: string | null | undefined): string {
  const date = toDate(iso);
  if (!date) return "";
  return new Date(date.getTime() + manilaOffsetMilliseconds).toISOString().slice(0, 16);
}

export function manilaInputToIso(value: string): string | null {
  if (!inputShape.test(value)) return null;
  const minute = value.slice(0, 16);
  const date = toDate(`${minute}:00+08:00`);
  if (!date) return null;
  return isoToManilaInput(date.toISOString()) === minute ? date.toISOString() : null;
}

function format(value: string | Date | null | undefined, options: Intl.DateTimeFormatOptions): string | null {
  const date = toDate(value);
  if (!date) return null;
  return new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Manila", hourCycle: "h12", ...options })
    .format(date)
    .replace(/\s/g, " ");
}

export function formatManilaDateTime(value: string | Date | null | undefined): string | null {
  const text = format(value, { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
  return text ? `${text}, Manila time` : null;
}

export function formatManilaClock(value: string | Date | null | undefined): string | null {
  return format(value, { hour: "numeric", minute: "2-digit", second: "2-digit" });
}

export function formatCountdown(milliseconds: number): string {
  const seconds = Math.max(0, Math.ceil(milliseconds / 1000));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const two = (value: number) => String(value).padStart(2, "0");
  return hours > 0 ? `${hours}:${two(minutes)}:${two(seconds % 60)}` : `${two(minutes)}:${two(seconds % 60)}`;
}
