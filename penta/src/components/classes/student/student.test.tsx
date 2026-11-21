import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { ClassDetail } from "./ClassDetail";
import { ClassList } from "./ClassList";
import { ClassesHeader, classCountLabel } from "./ClassesHeader";
import { JoinForm } from "./JoinForm";

afterEach(cleanup);

const classes = [
  {
    id: "7b0f6a52-1c1d-4f6e-9d55-0d6d3a1f2c11",
    code: "INTE 301",
    title: "Architecture 1",
    section: "BSIT 3-1",
    term: "1st Sem 2026",
    teacherName: "Jose Cruz",
  },
  {
    id: "0f3f8e0a-52a7-4b6c-8a44-6f0b0f0f9d22",
    code: "COMP 018",
    title: "Database Administration",
    section: "",
    term: "",
    teacherName: "Teacher",
  },
];

const idle = async () => ({});

describe("ClassesHeader", () => {
  it("shows the one h1 and the count", () => {
    render(<ClassesHeader count={2} />);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Your classes");
    expect(screen.getByText("2 classes")).toBeTruthy();
  });

  it("words the count for zero, one and many", () => {
    expect(classCountLabel(0)).toBe("0 classes");
    expect(classCountLabel(1)).toBe("1 class");
    expect(classCountLabel(12)).toBe("12 classes");
  });
});

describe("ClassList", () => {
  it("shows the empty state", () => {
    render(<ClassList classes={[]} />);
    expect(screen.getByText("No classes yet. Enter a join code from your teacher.")).toBeTruthy();
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("links each class to its page in the order given", () => {
    render(<ClassList classes={classes} />);
    const links = screen.getAllByRole("link");
    expect(links.map((link) => link.getAttribute("href"))).toEqual([
      "/classes/7b0f6a52-1c1d-4f6e-9d55-0d6d3a1f2c11",
      "/classes/0f3f8e0a-52a7-4b6c-8a44-6f0b0f0f9d22",
    ]);
    expect(screen.queryByText(/No classes yet/)).toBeNull();
  });

  it("shows code, section, term, title and teacher on a card", () => {
    render(<ClassList classes={[classes[0]]} />);
    const card = screen.getByRole("link").textContent ?? "";
    for (const text of ["INTE 301", "BSIT 3-1", "1st Sem 2026", "Architecture 1", "Teacher Jose Cruz"]) {
      expect(card).toContain(text);
    }
    expect(card).not.toMatch(/Lesson/);
  });

  it("leaves out an empty section and term", () => {
    render(<ClassList classes={[classes[1]]} />);
    expect(screen.getByRole("link").textContent).not.toContain("[");
  });

  it("renders a title with markup as text", () => {
    const { container } = render(<ClassList classes={[{ ...classes[0], title: "<img src=x onerror=alert(1)>" }]} />);
    expect(container.querySelector("img")).toBeNull();
    expect(screen.getByText("<img src=x onerror=alert(1)>")).toBeTruthy();
  });
});

describe("JoinForm", () => {
  it("renders the label, hint and submit button", () => {
    render(<JoinForm action={idle} />);
    const input = screen.getByLabelText("Join code") as HTMLInputElement;
    const hint = screen.getByText("10 characters, for example K7M2P-9XQ4T. Hyphens and spaces are fine.");
    const button = screen.getByRole("button", { name: "Join class" }) as HTMLButtonElement;
    expect(input.name).toBe("code");
    expect(input.getAttribute("aria-describedby")).toBe(hint.id);
    expect(button.type).toBe("submit");
    expect(button.disabled).toBe(false);
  });

  it("sets the typing helpers on the input", () => {
    render(<JoinForm action={idle} />);
    const input = screen.getByLabelText("Join code") as HTMLInputElement;
    expect(input.getAttribute("autocapitalize")).toBe("characters");
    expect(input.getAttribute("autocomplete")).toBe("off");
    expect(input.getAttribute("spellcheck")).toBe("false");
    expect(input.maxLength).toBe(24);
  });

  it("ties a code error to the field and keeps the typed code", () => {
    render(<JoinForm action={idle} initialState={{ codeError: "A join code has 10 letters and numbers.", code: "K7M" }} />);
    const input = screen.getByLabelText(/Join code/) as HTMLInputElement;
    const error = screen.getByText("Error: A join code has 10 letters and numbers.");
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(input.getAttribute("aria-describedby")).toContain(error.id);
    expect(input.value).toBe("K7M");
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("shows a form level error as an alert", () => {
    render(<JoinForm action={idle} initialState={{ formError: "Could not join the class. Try again." }} />);
    expect(screen.getByRole("alert").textContent).toBe("Could not join the class. Try again.");
  });
});

describe("ClassDetail", () => {
  const detail = {
    code: "INTE 301",
    section: "BSIT 3-1",
    term: "1st Sem 2026",
    title: "Architecture 1",
    teacherName: "Jose Cruz",
    joinedOn: "November 27, 2026",
  };

  it("shows the title as the one h1 with code, section, term and teacher", () => {
    render(<ClassDetail {...detail} />);
    expect(screen.getAllByRole("heading", { level: 1 }).map((heading) => heading.textContent)).toEqual([
      "Architecture 1",
    ]);
    for (const text of ["INTE 301", "BSIT 3-1", "1st Sem 2026", "Jose Cruz", "Joined on November 27, 2026"]) {
      expect(screen.getByText(text)).toBeTruthy();
    }
  });

  it("shows honest empty states for lessons, decks and activities", () => {
    render(<ClassDetail {...detail} />);
    expect(screen.getAllByRole("heading", { level: 2 }).map((heading) => heading.textContent)).toEqual([
      "Lessons",
      "Decks",
      "Activities",
    ]);
    expect(screen.getByText("Nothing here yet. Lessons arrive in a later update.")).toBeTruthy();
    expect(screen.getAllByText(/^Nothing here yet\./)).toHaveLength(3);
  });

  it("links back to the class list and shows no join code", () => {
    render(<ClassDetail {...detail} />);
    expect(screen.getByRole("link", { name: "Back to your classes" }).getAttribute("href")).toBe("/classes");
    expect(screen.queryByText(/join code/i)).toBeNull();
  });

  it("skips the joined line when the date cannot be read", () => {
    render(<ClassDetail {...detail} joinedOn={null} />);
    expect(screen.queryByText(/Joined on/)).toBeNull();
  });
});
