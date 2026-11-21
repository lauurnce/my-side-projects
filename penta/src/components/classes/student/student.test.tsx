import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { ClassOutline } from "@/lib/routes";
import { ClassDetail } from "./ClassDetail";
import { ClassList } from "./ClassList";
import { ClassesHeader, classCountLabel } from "./ClassesHeader";
import { ContinueBlock, OutlineList, ProgressBlock } from "./ClassOutline";
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
    done: 7,
    published: 12,
    meters: 1750,
  },
  {
    id: "0f3f8e0a-52a7-4b6c-8a44-6f0b0f0f9d22",
    code: "COMP 018",
    title: "Database Administration",
    section: "",
    term: "",
    teacherName: "Teacher",
    done: 0,
    published: 0,
    meters: 0,
  },
];

const classId = "7b0f6a52-1c1d-4f6e-9d55-0d6d3a1f2c11";

function lesson(id: string, title: string, state: "done" | "todo" | "draft", estMinutes = 10) {
  return { id, moduleId: "m", title, estMinutes, published: state !== "draft", done: state === "done" };
}

const outline: ClassOutline = {
  classId,
  modules: [
    { id: "m1", classId, title: "Foundations", lessons: [lesson("l1", "What is a system", "done"), lesson("l2", "Hidden draft", "draft")] },
    { id: "m2", classId, title: "Drafts only", lessons: [lesson("l3", "Not ready", "draft")] },
    { id: "m3", classId, title: "No lessons", lessons: [] },
    { id: "m4", classId, title: "Integration", lessons: [lesson("l4", "Message queues", "todo", 25), lesson("l5", "Adapters", "todo")] },
  ],
};

const emptyOutline: ClassOutline = { classId, modules: [] };

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
  });

  it("shows real progress and altitude on a card", () => {
    const { container } = render(<ClassList classes={classes} />);
    const [first, second] = screen.getAllByRole("link");
    expect(first.textContent).toContain("7 of 12 lessons");
    expect(first.textContent).toContain("1,750 meters");
    expect(second.textContent).toContain("0 of 0 lessons");
    expect(second.textContent).toContain("0 meters");
    const fills = [...container.querySelectorAll<HTMLElement>("[data-fill]")].map((fill) => fill.style.width);
    expect(fills).toEqual(["58%", "0%"]);
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
    classId,
    outline,
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

  it("shows progress, the next lesson and the outline when lessons exist", () => {
    render(<ClassDetail {...detail} />);
    expect(screen.getByText("1 of 3 lessons done")).toBeTruthy();
    expect(screen.getByText("1,000 meters")).toBeTruthy();
    const next = screen.getByRole("link", { name: /Continue where you left off/ });
    expect(next.getAttribute("href")).toBe(`/classes/${classId}/lessons/l4`);
    expect(next.textContent).toContain("Message queues");
    expect(screen.getAllByRole("heading", { level: 2 }).map((heading) => heading.textContent)).toEqual([
      "Foundations",
      "Integration",
    ]);
  });

  it("shows one empty state and no progress when nothing is published", () => {
    render(<ClassDetail {...detail} outline={emptyOutline} />);
    expect(screen.getByText("No lessons yet. Your teacher has not published any.")).toBeTruthy();
    expect(screen.queryByText(/lessons done/)).toBeNull();
    expect(screen.queryByRole("link", { name: /Continue/ })).toBeNull();
    expect(screen.queryByText("All lessons done.")).toBeNull();
    expect(screen.queryAllByRole("heading", { level: 2 })).toHaveLength(0);
  });

  it("keeps one quiet line for decks and activities", () => {
    render(<ClassDetail {...detail} />);
    expect(screen.getAllByText("Decks and activities arrive in a later update.")).toHaveLength(1);
    expect(screen.queryByText(/^Nothing here yet\./)).toBeNull();
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

describe("ProgressBlock", () => {
  it("shows the count, the altitude in words and a decorative bar", () => {
    const { container } = render(<ProgressBlock done={7} published={12} meters={1750} />);
    const block = screen.getByRole("region", { name: "Progress" });
    expect(block.textContent).toContain("7 of 12 lessons done");
    expect(screen.getByText("1,750 m").getAttribute("aria-hidden")).toBe("true");
    expect(screen.getByText("1,750 meters").className).toBe("visually-hidden");
    const fill = container.querySelector<HTMLElement>("[data-fill]");
    expect(fill?.style.width).toBe("58%");
    expect(fill?.parentElement?.getAttribute("aria-hidden")).toBe("true");
  });

  it("clamps the bar", () => {
    const { container } = render(<ProgressBlock done={9} published={3} meters={3000} />);
    expect(container.querySelector<HTMLElement>("[data-fill]")?.style.width).toBe("100%");
  });
});

describe("ContinueBlock", () => {
  it("links to the next lesson", () => {
    render(<ContinueBlock classId={classId} next={lesson("l4", "Message queues", "todo")} />);
    const link = screen.getByRole("link");
    expect(link.getAttribute("href")).toBe(`/classes/${classId}/lessons/l4`);
    expect(link.textContent).toContain("Continue where you left off");
    expect(link.textContent).toContain("Message queues");
  });

  it("says when every lesson is done", () => {
    render(<ContinueBlock classId={classId} next={null} />);
    expect(screen.getByText("All lessons done.")).toBeTruthy();
    expect(screen.queryByRole("link")).toBeNull();
  });
});

describe("OutlineList", () => {
  it("hides modules with no published lessons and numbers the rest", () => {
    render(<OutlineList classId={classId} outline={outline} />);
    expect(screen.getAllByRole("heading", { level: 2 }).map((heading) => heading.textContent)).toEqual([
      "Foundations",
      "Integration",
    ]);
    expect(screen.getByText("Module 01")).toBeTruthy();
    expect(screen.getByText("Module 02")).toBeTruthy();
    expect(screen.queryByText("Module 03")).toBeNull();
    expect(screen.queryByText("Drafts only")).toBeNull();
    expect(screen.queryByText("Hidden draft")).toBeNull();
  });

  it("links each published lesson in order", () => {
    render(<OutlineList classId={classId} outline={outline} />);
    expect(screen.getAllByRole("link").map((link) => link.getAttribute("href"))).toEqual(
      ["l1", "l4", "l5"].map((id) => `/classes/${classId}/lessons/${id}`),
    );
  });

  it("gives each lesson a status word, minutes and title, with no gold chip", () => {
    const { container } = render(<OutlineList classId={classId} outline={outline} />);
    const [done, todo] = screen.getAllByRole("link");
    expect(done.textContent).toBe("Done10 minWhat is a system");
    expect(todo.textContent).toBe("To do25 minMessage queues");
    const statuses = [...container.querySelectorAll("[data-status]")].map((chip) => chip.getAttribute("data-status"));
    expect(statuses).toEqual(["graded", "due", "due"]);
  });

  it("names each module section by its heading", () => {
    render(<OutlineList classId={classId} outline={outline} />);
    expect(screen.getByRole("region", { name: "Integration" })).toBeTruthy();
  });

  it("shows the empty state for no modules and for drafts only", () => {
    const draftsOnly = { classId, modules: [outline.modules[1], outline.modules[2]] };
    for (const empty of [emptyOutline, draftsOnly]) {
      render(<OutlineList classId={classId} outline={empty} />);
      expect(screen.getByText("No lessons yet. Your teacher has not published any.")).toBeTruthy();
      expect(screen.queryByRole("link")).toBeNull();
      cleanup();
    }
  });

  it("renders a lesson title with markup as text", () => {
    const risky = { classId, modules: [{ ...outline.modules[0], lessons: [lesson("x", "<img src=x onerror=alert(1)>", "todo")] }] };
    const { container } = render(<OutlineList classId={classId} outline={risky} />);
    expect(container.querySelector("img")).toBeNull();
    expect(screen.getByText("<img src=x onerror=alert(1)>")).toBeTruthy();
  });
});
