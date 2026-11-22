import { describe, expect, it } from "vitest";
import { nextNotice, noticeText, passedNotice, readClock, remainingMilliseconds, toMilliseconds } from "./timer";

const notices = [10, 5, 1] as const;
const serverNow = "2026-11-27T04:00:00.000Z";
const expiresAt = Date.parse("2026-11-27T04:20:00.000Z");

describe("server clock", () => {
  it("reads the server time with the moment it was fetched", () => {
    expect(readClock(serverNow, 1500)).toEqual({ serverNow: Date.parse(serverNow), fetchedAtPerf: 1500 });
  });

  it("gives nothing for a bad time", () => {
    expect(readClock("soon", 0)).toBeNull();
    expect(toMilliseconds(null)).toBeNull();
    expect(toMilliseconds("")).toBeNull();
  });
});

describe("remainingMilliseconds", () => {
  it("counts from the server clock and the time passed since it was read", () => {
    const clock = readClock(serverNow, 1000)!;

    expect(remainingMilliseconds(expiresAt, clock, 1000)).toBe(20 * 60_000);
    expect(remainingMilliseconds(expiresAt, clock, 61_000)).toBe(19 * 60_000);
  });

  it("does not depend on the clock of the device", () => {
    const clock = readClock(serverNow, 0)!;
    const before = remainingMilliseconds(expiresAt, clock, 30_000);

    expect(before).toBe(20 * 60_000 - 30_000);
  });

  it("is corrected by a newer server time", () => {
    const corrected = readClock("2026-11-27T04:05:00.000Z", 200_000)!;

    expect(remainingMilliseconds(expiresAt, corrected, 200_000)).toBe(15 * 60_000);
  });

  it("is never negative", () => {
    const clock = readClock(serverNow, 0)!;

    expect(remainingMilliseconds(expiresAt, clock, 21 * 60_000)).toBe(0);
    expect(remainingMilliseconds(Date.parse(serverNow) - 5000, clock, 0)).toBe(0);
  });
});

describe("timer notices", () => {
  it("finds the smallest notice already passed", () => {
    expect(passedNotice(11 * 60_000, notices)).toBeNull();
    expect(passedNotice(10 * 60_000, notices)).toBe(10);
    expect(passedNotice(4 * 60_000, notices)).toBe(5);
    expect(passedNotice(30_000, notices)).toBe(1);
  });

  it("fires each notice once while the time runs down", () => {
    const spoken: number[] = [];
    let last: number | null = passedNotice(12 * 60_000, notices);

    for (let remaining = 12 * 60_000; remaining > 0; remaining -= 250) {
      const due = nextNotice(remaining, last, notices);
      if (due === null) continue;
      spoken.push(due);
      last = due;
    }

    expect(spoken).toEqual([10, 5, 1]);
  });

  it("says nothing about a notice that passed before the page opened", () => {
    const last = passedNotice(4 * 60_000, notices);

    expect(nextNotice(4 * 60_000, last, notices)).toBeNull();
    expect(nextNotice(60_000, last, notices)).toBe(1);
  });

  it("says only the newest notice after a long sleep", () => {
    expect(nextNotice(45_000, null, notices)).toBe(1);
  });

  it("says no minute notice when the time is up", () => {
    expect(nextNotice(0, 5, notices)).toBeNull();
  });

  it("words the notices", () => {
    expect(noticeText(10)).toBe("10 minutes left.");
    expect(noticeText(1)).toBe("1 minute left.");
  });
});
