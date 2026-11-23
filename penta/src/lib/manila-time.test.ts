import { describe, expect, it } from "vitest";
import {
  dueLabel,
  formatCountdown,
  formatManilaClock,
  formatManilaDateTime,
  isoToManilaInput,
  lateLabel,
  manilaDayNumber,
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

describe("due label", () => {
  const due = "2026-11-28T15:59:00Z";

  it("says today when the due time is later the same Manila day", () => {
    expect(dueLabel(due, Date.parse("2026-11-28T02:00:00Z"))).toBe("Due today, 11:59 PM");
    expect(dueLabel(due, Date.parse("2026-11-27T16:00:00Z"))).toBe("Due today, 11:59 PM");
  });

  it("says tomorrow for the Manila day before, even when the UTC date is the same or two back", () => {
    expect(dueLabel(due, Date.parse("2026-11-27T15:59:00Z"))).toBe("Due tomorrow, 11:59 PM");
    expect(dueLabel(due, Date.parse("2026-11-26T16:30:00Z"))).toBe("Due tomorrow, 11:59 PM");
  });

  it("gives the date further out and after the due time", () => {
    expect(dueLabel(due, Date.parse("2026-11-20T00:00:00Z"))).toBe("Due Nov 28, 11:59 PM");
    expect(dueLabel(due, Date.parse("2026-11-28T15:59:00Z"))).toBe("Was due Nov 28, 11:59 PM");
  });

  it("is null with no due time", () => {
    expect(dueLabel(null, Date.now())).toBeNull();
  });

  it("numbers Manila days from Manila midnight", () => {
    expect(manilaDayNumber(Date.parse("2026-11-27T15:59:59Z"))).toBe(manilaDayNumber(Date.parse("2026-11-27T00:00:00Z")));
    expect(manilaDayNumber(Date.parse("2026-11-27T16:00:00Z"))).toBe(manilaDayNumber(Date.parse("2026-11-27T15:59:59Z")) + 1);
  });
});

describe("late label", () => {
  const due = "2026-11-28T15:59:00Z";

  it("is null on time, one second before", () => {
    expect(lateLabel("2026-11-28T15:58:59Z", due)).toBeNull();
    expect(lateLabel("2026-11-28T15:59:00Z", null)).toBeNull();
  });

  it("counts minutes, then hours, then days, rounded down with a minimum of one minute", () => {
    expect(lateLabel("2026-11-28T15:59:00Z", due)).toBe("Late by 1 minute");
    expect(lateLabel("2026-11-28T15:59:01Z", due)).toBe("Late by 1 minute");
    expect(lateLabel("2026-11-28T16:44:00Z", due)).toBe("Late by 45 minutes");
    expect(lateLabel("2026-11-28T17:00:00Z", due)).toBe("Late by 1 hour");
    expect(lateLabel("2026-11-29T15:58:00Z", due)).toBe("Late by 23 hours");
    expect(lateLabel("2026-11-29T15:59:00Z", due)).toBe("Late by 1 day");
    expect(lateLabel("2026-12-01T00:00:00Z", due)).toBe("Late by 2 days");
  });
});
