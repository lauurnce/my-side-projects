import { z } from "zod";

const enterCode = "Enter a join code.";

export const joinMessages = {
  invalid: "That code does not match a class. Check it with your teacher.",
  malformed: "A join code has 10 letters and numbers.",
  limitedFallback: "Too many wrong codes. Try again in 15 minutes.",
  not_student: "Only students can join a class.",
  failed: "Could not join the class. Try again.",
};

export const joinCodeSchema = z
  .string({ error: enterCode })
  .trim()
  .min(1, enterCode)
  .max(24, joinMessages.malformed);

export const joinResultSchema = z.object({
  status: z.enum(["joined", "already", "invalid", "malformed", "limited", "not_student", "signed_out"]),
  class_id: z.uuid().nullish(),
  retry_at: z.string().nullish(),
});

export type JoinResult = z.infer<typeof joinResultSchema>;
export type JoinFailureStatus = Exclude<JoinResult["status"], "joined" | "already"> | "error";
export type JoinState = { codeError?: string; formError?: string; code?: string };

function toDate(value: string | Date): Date | null {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatManilaTime(value: string | Date): string | null {
  const date = toDate(value);
  if (!date) return null;
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Manila",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  })
    .format(date)
    .replace(/\s/g, " ");
}

export function formatManilaDate(value: string | Date): string | null {
  const date = toDate(value);
  if (!date) return null;
  return new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Manila", dateStyle: "long" }).format(date);
}

function limitedMessage(retryAt?: string | null): string {
  const time = retryAt ? formatManilaTime(retryAt) : null;
  return time ? `Too many wrong codes. Try again at ${time}.` : joinMessages.limitedFallback;
}

export function joinMessage(status: JoinFailureStatus, retryAt?: string | null): string {
  if (status === "invalid") return joinMessages.invalid;
  if (status === "malformed") return joinMessages.malformed;
  if (status === "limited") return limitedMessage(retryAt);
  if (status === "not_student") return joinMessages.not_student;
  return joinMessages.failed;
}

export function joinFailure(status: JoinFailureStatus, retryAt?: string | null): JoinState {
  const message = joinMessage(status, retryAt);
  if (status === "invalid" || status === "malformed") return { codeError: message };
  return { formError: message };
}

export function joinDestination(result: JoinResult): string | null {
  if (!result.class_id) return null;
  if (result.status === "joined") return `/classes/${result.class_id}?joined=1`;
  if (result.status === "already") return `/classes/${result.class_id}`;
  return null;
}
