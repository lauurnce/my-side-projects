import { describe, expect, it } from "vitest";
import { classProgress, formatMeters, nextUp, progressPercent, toStudentClasses, withProgress } from "./classes";
import type { ClassOutline, OutlineLesson } from "./routes";

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

function lesson(id: string, state: "done" | "todo" | "draft"): OutlineLesson {
  return { id, moduleId: "m1", title: `Lesson ${id}`, estMinutes: 10, published: state !== "draft", done: state === "done" };
}

function outline(classId: string, ...modules: OutlineLesson[][]): ClassOutline {
  return {
    classId,
    modules: modules.map((lessons, index) => ({ id: `${classId}-m${index}`, classId, title: `Module ${index}`, lessons })),
  };
}

describe("classProgress", () => {
  it("counts done, published and drafts and points at the next lesson", () => {
    const progress = classProgress(
      outline("c1", [lesson("a", "done"), lesson("b", "draft")], [lesson("c", "todo"), lesson("d", "todo")]),
    );
    expect(progress).toEqual({ done: 1, published: 3, drafts: 1, next: lesson("c", "todo") });
  });

  it("is all zero for a class with no modules", () => {
    expect(classProgress({ classId: "c1", modules: [] })).toEqual({
      done: 0,
      published: 0,
      drafts: 0,
      next: null,
    });
  });

  it("reaches the summit with nothing next when everything is done", () => {
    const progress = classProgress(outline("c1", [lesson("a", "done"), lesson("b", "done")]));
    expect(progress).toMatchObject({ done: 2, published: 2, next: null });
  });

  it("never counts done above published", () => {
    const unpublishedButDone = { ...lesson("b", "draft"), done: true };
    const progress = classProgress(outline("c1", [lesson("a", "done"), unpublishedButDone]));
    expect(progress).toMatchObject({ done: 1, published: 1, drafts: 1 });
  });

  it("carries no altitude, which comes from the database", () => {
    expect(Object.keys(classProgress(outline("c1", [lesson("a", "done")])))).not.toContain("meters");
  });

  it("counts a class of drafts only as nothing published", () => {
    expect(classProgress(outline("c1", [lesson("a", "draft")]))).toMatchObject({
      published: 0,
      drafts: 1,
      next: null,
    });
  });
});

describe("withProgress", () => {
  it("joins each class with its own outline and keeps the order and fields", () => {
    const joined = withProgress(
      [
        { id: "c2", title: "Second" },
        { id: "c1", title: "First" },
      ],
      [outline("c1", [lesson("a", "done"), lesson("b", "todo")]), outline("c2", [lesson("c", "todo")])],
    );
    expect(joined.map((item) => [item.id, item.title, item.done, item.published])).toEqual([
      ["c2", "Second", 0, 1],
      ["c1", "First", 1, 2],
    ]);
  });

  it("gives zero progress to a class with no outline", () => {
    expect(withProgress([{ id: "c9" }], [outline("c1", [lesson("a", "done")])])).toEqual([
      { id: "c9", done: 0, published: 0, drafts: 0, next: null },
    ]);
  });
});

describe("nextUp", () => {
  const classes = withProgress(
    [
      { id: "c1", title: "Zoology" },
      { id: "c2", title: "Algebra" },
      { id: "c3", title: "Biology" },
    ],
    [
      outline("c1", [lesson("z", "todo")]),
      outline("c2", [lesson("a", "done")]),
      outline("c3", [lesson("b", "done"), lesson("c", "todo")]),
    ],
  );

  it("picks the first class by title that has an unfinished lesson", () => {
    const target = nextUp(classes);
    expect(target?.id).toBe("c3");
    expect(target?.next.id).toBe("c");
  });

  it("is null when everything is done or nothing exists", () => {
    expect(nextUp([classes[1]])).toBeNull();
    expect(nextUp([])).toBeNull();
  });
});

describe("progressPercent", () => {
  it("is a clamped whole percent", () => {
    expect(progressPercent({ done: 1, published: 3 })).toBe(33);
    expect(progressPercent({ done: 5, published: 2 })).toBe(100);
    expect(progressPercent({ done: -1, published: 2 })).toBe(0);
    expect(progressPercent({ done: 0, published: 0 })).toBe(0);
  });
});

describe("formatMeters", () => {
  it("groups thousands", () => {
    expect(formatMeters(1750)).toBe("1,750");
    expect(formatMeters(0)).toBe("0");
  });
});
