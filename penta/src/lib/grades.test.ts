import { describe, expect, it } from "vitest";
import { altitudeFor, gradeTotals, noAltitude, toAltitude, toGradeCell } from "@/lib/grades";
import { submissionDownloadName } from "@/lib/submissions";

describe("grade totals", () => {
  it("counts graded work and missing work, and leaves the rest out", () => {
    const totals = gradeTotals([
      { state: "graded", score: 18, points: 20 },
      { state: "missing", score: null, points: 10 },
      { state: "submitted", score: null, points: 50 },
      { state: "in_progress", score: null, points: 5 },
      { state: "none", score: null, points: 30 },
    ]);
    expect(totals).toEqual({ earned: 18, possible: 30, percent: 60, notGraded: 1 });
  });

  it("rounds the percent down", () => {
    expect(gradeTotals([{ state: "graded", score: 2, points: 3 }]).percent).toBe(66);
    expect(gradeTotals([{ state: "graded", score: 199, points: 200 }]).percent).toBe(99);
  });

  it("has no percent when nothing counts", () => {
    expect(gradeTotals([])).toEqual({ earned: 0, possible: 0, percent: null, notGraded: 0 });
    expect(gradeTotals([{ state: "submitted", score: null, points: 20 }]).percent).toBeNull();
  });

  it("never lets a score pass the points", () => {
    expect(gradeTotals([{ state: "graded", score: 30, points: 20 }])).toMatchObject({ earned: 20, percent: 100 });
  });
});

describe("grade cell", () => {
  it("maps a row and treats an unknown state as none", () => {
    const row = { student_id: "s1", activity_id: "a1", state: "graded", score: 4, points: 5, late: true, submitted_at: null };
    expect(toGradeCell(row)).toMatchObject({ studentId: "s1", activityId: "a1", state: "graded", late: true });
    expect(toGradeCell({ ...row, state: "odd" }).state).toBe("none");
  });
});

describe("altitude", () => {
  const reply = {
    overall: 1700,
    classes: [
      {
        class_id: "c1",
        counts: true,
        meters: 1708,
        lessons_done: 1,
        lessons_published: 3,
        decks_finished: 1,
        decks: 2,
        points_earned: 21,
        points_possible: 25,
      },
    ],
  };

  it("reads what the database returns", () => {
    const altitude = toAltitude(reply);
    expect(altitude.overall).toBe(1700);
    expect(altitudeFor(altitude, "c1")).toMatchObject({ meters: 1708, lessonsPublished: 3, pointsPossible: 25 });
    expect(altitudeFor(altitude, "c2")).toBeNull();
  });

  it("is zero for nothing or a malformed reply", () => {
    expect(toAltitude(null)).toEqual(noAltitude);
    expect(toAltitude({ overall: "high" })).toEqual(noAltitude);
  });
});

describe("submission download name", () => {
  it("is built from the student and the activity, not from the student's file name", () => {
    expect(submissionDownloadName("Ana Reyes", "Essay on roles", "PDF")).toBe("Ana-Reyes-Essay-on-roles.pdf");
    expect(submissionDownloadName("Peña, José", "Week 3: Draft", "DOCX")).toBe("Pena-Jose-Week-3-Draft.docx");
  });

  it("drops path parts, line breaks and direction characters, and falls back", () => {
    expect(submissionDownloadName('../x"\r\nSet-Cookie: a', "t‮gpj", "PDF")).toBe("x-Set-Cookie-a-t-gpj.pdf");
    expect(submissionDownloadName("数据", "库", "DOCX")).toBe("submission.docx");
  });
});
