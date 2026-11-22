import { describe, expect, it } from "vitest";
import {
  formatCountdown,
  formatManilaClock,
  formatManilaDateTime,
  isoToManilaInput,
  manilaInputToIso,
} from "@/lib/manila-time";

describe("test clock", () => {
  it("runs in UTC so a local zone cannot hide a wrong conversion", () => {
    expect(new Date().getTimezoneOffset()).toBe(0);
  });
});

describe("manila input to an instant", () => {
  it("reads the typed minute as Manila time", () => {
    expect(manilaInputToIso("2026-11-28T23:59")).toBe("2026-11-28T15:59:00.000Z");
    expect(manilaInputToIso("2026-11-28T00:00")).toBe("2026-11-27T16:00:00.000Z");
    expect(manilaInputToIso("2026-12-31T23:59")).toBe("2026-12-31T15:59:00.000Z");
    expect(manilaInputToIso("2028-02-29T07:30")).toBe("2028-02-28T23:30:00.000Z");
  });

  it("drops seconds", () => {
    expect(manilaInputToIso("2026-11-28T23:59:45")).toBe("2026-11-28T15:59:00.000Z");
  });

  it("rejects a date that does not exist and other shapes", () => {
    for (const value of ["2026-02-30T10:00", "2026-13-01T10:00", "2026-11-28T24:00", "2026-11-28T23:59Z", "", "tomorrow", "2026-11-28"]) {
      expect(manilaInputToIso(value)).toBeNull();
    }
  });
});

describe("an instant to manila input", () => {
  it("shows the Manila minute", () => {
    expect(isoToManilaInput("2026-11-28T15:59:00.000Z")).toBe("2026-11-28T23:59");
    expect(isoToManilaInput("2026-11-27T16:00:00+00:00")).toBe("2026-11-28T00:00");
  });

  it("is empty for nothing or an invalid value", () => {
    expect(isoToManilaInput(null)).toBe("");
    expect(isoToManilaInput("nope")).toBe("");
  });

  it("round trips without drift", () => {
    for (const value of ["2026-11-28T00:00", "2026-11-28T23:59", "2026-12-31T23:59", "2027-01-01T00:00", "2028-02-29T12:00"]) {
      expect(isoToManilaInput(manilaInputToIso(value))).toBe(value);
    }
  });
});

describe("display", () => {
  it("formats a due time in Manila with the zone named", () => {
    expect(formatManilaDateTime("2026-11-28T15:59:00Z")).toBe("Nov 28, 2026, 11:59 PM, Manila time");
    expect(formatManilaDateTime("2026-11-27T16:00:00Z")).toBe("Nov 28, 2026, 12:00 AM, Manila time");
  });

  it("formats a clock time with seconds", () => {
    expect(formatManilaClock("2026-11-28T02:42:07Z")).toBe("10:42:07 AM");
  });

  it("uses plain spaces only", () => {
    expect(formatManilaDateTime("2026-11-28T15:59:00Z")).not.toMatch(/[  ]/);
  });

  it("returns null for nothing or an invalid value", () => {
    expect(formatManilaDateTime(null)).toBeNull();
    expect(formatManilaClock("nope")).toBeNull();
  });
});

describe("countdown", () => {
  it("counts minutes and seconds, rounding up to the next second", () => {
    expect(formatCountdown(600000)).toBe("10:00");
    expect(formatCountdown(59001)).toBe("01:00");
    expect(formatCountdown(999)).toBe("00:01");
  });

  it("adds hours above 59 minutes and never goes below zero", () => {
    expect(formatCountdown(3 * 3600000 + 5000)).toBe("3:00:05");
    expect(formatCountdown(-4000)).toBe("00:00");
  });
});
