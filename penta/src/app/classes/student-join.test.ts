import { describe, expect, it } from "vitest";
import {
  formatManilaDate,
  formatManilaTime,
  joinCodeSchema,
  joinDestination,
  joinFailure,
  joinMessage,
  joinResultSchema,
} from "./student-join";

const classId = "7b0f6a52-1c1d-4f6e-9d55-0d6d3a1f2c11";

describe("joinCodeSchema", () => {
  it("trims and keeps hyphens, spaces and case for the database to normalize", () => {
    expect(joinCodeSchema.parse("  k7m2p-9xq4t ")).toBe("k7m2p-9xq4t");
    expect(joinCodeSchema.parse("K7M2P 9XQ4T")).toBe("K7M2P 9XQ4T");
  });

  it("accepts 1 to 24 characters", () => {
    expect(joinCodeSchema.safeParse("A").success).toBe(true);
    expect(joinCodeSchema.safeParse("A".repeat(24)).success).toBe(true);
  });

  it("asks for a code when the field is empty or blank", () => {
    expect(joinCodeSchema.safeParse("").error?.issues[0].message).toBe("Enter a join code.");
    expect(joinCodeSchema.safeParse("   ").error?.issues[0].message).toBe("Enter a join code.");
  });

  it("rejects more than 24 characters", () => {
    expect(joinCodeSchema.safeParse("A".repeat(25)).error?.issues[0].message).toBe(
      "A join code has 10 letters and numbers.",
    );
  });

  it("rejects a value that is not text", () => {
    expect(joinCodeSchema.safeParse(null).error?.issues[0].message).toBe("Enter a join code.");
    expect(joinCodeSchema.safeParse(new File(["x"], "code.txt")).success).toBe(false);
  });
});

describe("joinResultSchema", () => {
  it("reads each shape the function returns", () => {
    expect(joinResultSchema.parse({ status: "joined", class_id: classId }).class_id).toBe(classId);
    expect(joinResultSchema.parse({ status: "invalid" }).status).toBe("invalid");
    expect(joinResultSchema.parse({ status: "limited", retry_at: "2026-11-27T07:45:00+00:00" }).retry_at).toBe(
      "2026-11-27T07:45:00+00:00",
    );
  });

  it("refuses an unknown status, a bad class id and non-objects", () => {
    expect(joinResultSchema.safeParse({ status: "owner" }).success).toBe(false);
    expect(joinResultSchema.safeParse({ status: "joined", class_id: "../hub" }).success).toBe(false);
    expect(joinResultSchema.safeParse(null).success).toBe(false);
    expect(joinResultSchema.safeParse("joined").success).toBe(false);
  });
});

describe("formatManilaTime", () => {
  it("shows the time in Asia/Manila", () => {
    expect(formatManilaTime("2026-11-27T07:45:00+00:00")).toBe("3:45 PM");
    expect(formatManilaTime("2026-11-27T07:45:12.345678+00:00")).toBe("3:45 PM");
    expect(formatManilaTime("2026-11-27T16:05:00Z")).toBe("12:05 AM");
  });

  it("returns null for a value that is not a date", () => {
    expect(formatManilaTime("soon")).toBeNull();
  });
});

describe("formatManilaDate", () => {
  it("shows the date in Asia/Manila, across midnight", () => {
    expect(formatManilaDate("2026-11-26T16:30:00Z")).toBe("November 27, 2026");
    expect(formatManilaDate("2026-11-26T15:30:00Z")).toBe("November 26, 2026");
  });

  it("returns null for a value that is not a date", () => {
    expect(formatManilaDate("")).toBeNull();
  });
});

describe("joinMessage", () => {
  it("has a fixed message for every failure status", () => {
    expect(joinMessage("invalid")).toBe("That code does not match a class. Check it with your teacher.");
    expect(joinMessage("malformed")).toBe("A join code has 10 letters and numbers.");
    expect(joinMessage("not_student")).toBe("Only students can join a class.");
    expect(joinMessage("signed_out")).toBe("Could not join the class. Try again.");
    expect(joinMessage("error")).toBe("Could not join the class. Try again.");
  });

  it("shows the retry time for limited", () => {
    expect(joinMessage("limited", "2026-11-27T07:45:00+00:00")).toBe("Too many wrong codes. Try again at 3:45 PM.");
  });

  it("falls back to 15 minutes when retry_at is missing or unreadable", () => {
    expect(joinMessage("limited")).toBe("Too many wrong codes. Try again in 15 minutes.");
    expect(joinMessage("limited", null)).toBe("Too many wrong codes. Try again in 15 minutes.");
    expect(joinMessage("limited", "soon")).toBe("Too many wrong codes. Try again in 15 minutes.");
  });

  it("ignores retry_at for other statuses", () => {
    expect(joinMessage("invalid", "2026-11-27T07:45:00+00:00")).toBe(
      "That code does not match a class. Check it with your teacher.",
    );
  });
});

describe("joinFailure", () => {
  it("ties code problems to the field", () => {
    expect(joinFailure("invalid")).toEqual({
      codeError: "That code does not match a class. Check it with your teacher.",
    });
    expect(joinFailure("malformed")).toEqual({ codeError: "A join code has 10 letters and numbers." });
  });

  it("puts the rest at form level", () => {
    expect(joinFailure("limited")).toEqual({ formError: "Too many wrong codes. Try again in 15 minutes." });
    expect(joinFailure("not_student")).toEqual({ formError: "Only students can join a class." });
    expect(joinFailure("signed_out")).toEqual({ formError: "Could not join the class. Try again." });
    expect(joinFailure("error")).toEqual({ formError: "Could not join the class. Try again." });
  });
});

describe("joinDestination", () => {
  it("sends a new member to the class with the joined flag", () => {
    expect(joinDestination({ status: "joined", class_id: classId })).toBe(`/classes/${classId}?joined=1`);
  });

  it("sends an existing member to the class", () => {
    expect(joinDestination({ status: "already", class_id: classId })).toBe(`/classes/${classId}`);
  });

  it("has no destination without a class id or for a failure", () => {
    expect(joinDestination({ status: "joined" })).toBeNull();
    expect(joinDestination({ status: "invalid", class_id: classId })).toBeNull();
    expect(joinDestination({ status: "limited" })).toBeNull();
  });
});
