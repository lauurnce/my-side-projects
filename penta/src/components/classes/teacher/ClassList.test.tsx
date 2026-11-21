import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { ClassList, lessonCounts } from "./ClassList";
import { JoinCodeBox } from "./JoinCodeBox";

afterEach(cleanup);

const classes = [
  {
    id: "3f2b8c1e-6a4d-4e5f-9b7a-1c2d3e4f5a6b",
    code: "COMP 018",
    title: "Web Development",
    section: "BSIT 3-3",
    term: "1st Sem AY 2026-27",
    studentCount: 1,
    published: 4,
    drafts: 1,
  },
  {
    id: "9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d",
    code: "INTE 301",
    title: "Systems Integration",
    section: "",
    term: "",
    studentCount: 32,
    published: 0,
    drafts: 0,
  },
];

describe("ClassList", () => {
  it("shows the empty state when there are no classes", () => {
    render(<ClassList classes={[]} />);
    expect(screen.getByText("No classes yet. Create your first class.")).toBeTruthy();
    expect(screen.queryByRole("list")).toBeNull();
  });

  it("links each class to its page", () => {
    render(<ClassList classes={classes} />);
    const links = screen.getAllByRole("link") as HTMLAnchorElement[];
    expect(links.map((link) => link.getAttribute("href"))).toEqual(classes.map((item) => `/classes/${item.id}`));
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
  });

  it("shows code, section, title, term and the student count", () => {
    render(<ClassList classes={classes} />);
    const text = screen.getAllByRole("link")[0].textContent;
    for (const part of ["COMP 018", "BSIT 3-3", "Web Development", "1st Sem AY 2026-27", "1 student"]) {
      expect(text).toContain(part);
    }
    expect(text).not.toContain("1 students");
  });

  it("leaves out an empty section and says when no term is set", () => {
    render(<ClassList classes={classes} />);
    const text = screen.getAllByRole("link")[1].textContent;
    expect(text).not.toContain("[");
    expect(text).toContain("No term set");
    expect(text).toContain("32 students");
  });
});

describe("lesson counts", () => {
  it("shows published and draft counts on each card and keeps the student count", () => {
    render(<ClassList classes={classes} />);
    const [first, second] = screen.getAllByRole("link").map((link) => link.textContent);
    expect(first).toContain("4 published · 1 draft");
    expect(first).not.toContain("1 drafts");
    expect(first).toContain("1 student");
    expect(second).toContain("0 published · 0 drafts");
    expect(second).toContain("32 students");
  });

  it("words the counts", () => {
    expect(lessonCounts(12, 3)).toBe("12 published · 3 drafts");
    expect(lessonCounts(1, 1)).toBe("1 published · 1 draft");
  });
});

describe("JoinCodeBox", () => {
  it("shows the formatted code under its label with the note", () => {
    render(<JoinCodeBox code="ABCDE23456" />);
    const box = screen.getByRole("region", { name: "Join code" });
    expect(box.textContent).toContain("ABCDE-23456");
    expect(
      screen.getByText("Students enter this code on their Classes page. It changes when you remove a student."),
    ).toBeTruthy();
  });

  it("says when the code is unavailable", () => {
    render(<JoinCodeBox code={null} />);
    expect(screen.getByText("Unavailable")).toBeTruthy();
  });
});
