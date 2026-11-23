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

const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

type ManilaParts = { date: string; year: number; hour: number; minute: string; second: string; half: "AM" | "PM" };

function manilaParts(value: string | Date | null | undefined): ManilaParts | null {
  const date = toDate(value);
  if (!date) return null;
  const shifted = new Date(date.getTime() + manilaOffsetMilliseconds);
  const hours = shifted.getUTCHours();
  return {
    date: `${monthNames[shifted.getUTCMonth()]} ${shifted.getUTCDate()}`,
    year: shifted.getUTCFullYear(),
    hour: hours % 12 === 0 ? 12 : hours % 12,
    minute: String(shifted.getUTCMinutes()).padStart(2, "0"),
    second: String(shifted.getUTCSeconds()).padStart(2, "0"),
    half: hours < 12 ? "AM" : "PM",
  };
}

function manilaTimeOfDay(parts: ManilaParts): string {
  return `${parts.hour}:${parts.minute} ${parts.half}`;
}

export function formatManilaDateTime(value: string | Date | null | undefined): string | null {
  const parts = manilaParts(value);
  return parts ? `${parts.date}, ${parts.year}, ${manilaTimeOfDay(parts)}, Manila time` : null;
}

export function formatManilaClock(value: string | Date | null | undefined): string | null {
  const parts = manilaParts(value);
  return parts ? `${parts.hour}:${parts.minute}:${parts.second} ${parts.half}` : null;
}

export function formatCountdown(milliseconds: number): string {
  const seconds = Math.max(0, Math.ceil(milliseconds / 1000));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const two = (value: number) => String(value).padStart(2, "0");
  return hours > 0 ? `${hours}:${two(minutes)}:${two(seconds % 60)}` : `${two(minutes)}:${two(seconds % 60)}`;
}

const dayMilliseconds = 24 * 60 * 60 * 1000;

export function manilaDayNumber(milliseconds: number): number {
  return Math.floor((milliseconds + manilaOffsetMilliseconds) / dayMilliseconds);
}

export function formatManilaShort(value: string | Date | null | undefined): string | null {
  const parts = manilaParts(value);
  return parts ? `${parts.date}, ${manilaTimeOfDay(parts)}` : null;
}

export function dueLabel(dueAt: string | null | undefined, now: number): string | null {
  const due = toDate(dueAt);
  if (!due) return null;
  const parts = manilaParts(due);
  const time = parts ? manilaTimeOfDay(parts) : "";
  const days = manilaDayNumber(due.getTime()) - manilaDayNumber(now);
  if (due.getTime() <= now) return `Was due ${formatManilaShort(due)}`;
  if (days === 0) return `Due today, ${time}`;
  if (days === 1) return `Due tomorrow, ${time}`;
  return `Due ${formatManilaShort(due)}`;
}

export function lateLabel(submittedAt: string | null | undefined, dueAt: string | null | undefined): string | null {
  const submitted = toDate(submittedAt);
  const due = toDate(dueAt);
  if (!submitted || !due || submitted.getTime() < due.getTime()) return null;
  const minutes = Math.max(1, Math.floor((submitted.getTime() - due.getTime()) / 60000));
  if (minutes < 60) return `Late by ${minutes} ${minutes === 1 ? "minute" : "minutes"}`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Late by ${hours} ${hours === 1 ? "hour" : "hours"}`;
  const days = Math.floor(hours / 24);
  return `Late by ${days} ${days === 1 ? "day" : "days"}`;
}
