export type ServerClock = { serverNow: number; fetchedAtPerf: number };

const minute = 60_000;

export function toMilliseconds(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const time = new Date(iso).getTime();
  return Number.isNaN(time) ? null : time;
}

export function readClock(serverNowIso: string, perfNow: number): ServerClock | null {
  const serverNow = toMilliseconds(serverNowIso);
  return serverNow === null ? null : { serverNow, fetchedAtPerf: perfNow };
}

export function remainingMilliseconds(expiresAt: number, clock: ServerClock, perfNow: number): number {
  return Math.max(0, expiresAt - (clock.serverNow + (perfNow - clock.fetchedAtPerf)));
}

export function passedNotice(remaining: number, noticeMinutes: readonly number[]): number | null {
  const passed = noticeMinutes.filter((minutes) => remaining <= minutes * minute);
  return passed.length > 0 ? Math.min(...passed) : null;
}

export function nextNotice(remaining: number, lastSpoken: number | null, noticeMinutes: readonly number[]): number | null {
  const passed = passedNotice(remaining, noticeMinutes);
  if (passed === null || remaining <= 0) return null;
  return lastSpoken === null || passed < lastSpoken ? passed : null;
}

export function noticeText(minutes: number): string {
  return minutes === 1 ? "1 minute left." : `${minutes} minutes left.`;
}

export const timeUpText = "Time is up. Submitting your answers.";
