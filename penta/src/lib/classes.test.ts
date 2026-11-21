import { describe, expect, it } from "vitest";
import { toStudentClasses } from "./classes";

const database = {
  id: "c1",
  code: "COMP 018",
  title: "Database Administration",
  section: "BSIT 3-3",
  term: "1st Sem 2026",
  teacher_id: "t1",
};
const architecture = {
  id: "c2",
  code: "INTE 301",
  title: "Architecture 1",
  section: "BSIT 3-1",
  term: "1st Sem 2026",
  teacher_id: "t2",
};

describe("toStudentClasses", () => {
  it("shapes a class with its teacher name", () => {
    expect(toStudentClasses([database], [{ id: "t1", full_name: "Maria Santos" }])).toEqual([
      {
        id: "c1",
        code: "COMP 018",
        title: "Database Administration",
        section: "BSIT 3-3",
        term: "1st Sem 2026",
        teacherName: "Maria Santos",
      },
    ]);
  });

  it("sorts by title", () => {
    const teachers = [
      { id: "t1", full_name: "Maria Santos" },
      { id: "t2", full_name: "Jose Cruz" },
    ];
    expect(toStudentClasses([database, architecture], teachers).map((row) => row.title)).toEqual([
      "Architecture 1",
      "Database Administration",
    ]);
  });

  it("falls back to Teacher when the name cannot be read", () => {
    expect(toStudentClasses([database], [])[0].teacherName).toBe("Teacher");
    expect(toStudentClasses([database], [{ id: "t1", full_name: "" }])[0].teacherName).toBe("Teacher");
  });

  it("returns an empty list for no classes", () => {
    expect(toStudentClasses([], [{ id: "t1", full_name: "Maria Santos" }])).toEqual([]);
  });

  it("does not leak the teacher id", () => {
    expect(Object.keys(toStudentClasses([database], [])[0])).not.toContain("teacher_id");
  });
});
