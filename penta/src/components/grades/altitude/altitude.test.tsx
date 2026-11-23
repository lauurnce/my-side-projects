import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import type { Altitude, ClassAltitude } from "@/lib/grades";

const loadAltitude = vi.fn();
const listStudentClasses = vi.fn();
const client = { name: "client" };

vi.mock("@/lib/supabase/server", () => ({ createClient: async () => client }));
vi.mock("@/lib/grades", async (original) => ({
  ...(await original<typeof import("@/lib/grades")>()),
  loadAltitude: (...values: unknown[]) => loadAltitude(...values),
}));
vi.mock("@/lib/classes", async (original) => ({
  ...(await original<typeof import("@/lib/classes")>()),
  listStudentClasses: (...values: unknown[]) => listStudentClasses(...values),
}));

import { AltitudePanel } from "../AltitudePanel";
import { AltitudeView } from "./AltitudeView";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function classAltitude(classId: string, overrides: Partial<ClassAltitude> = {}): ClassAltitude {
  return {
    classId,
    counts: true,
    meters: 1708,
    lessonsDone: 1,
    lessonsPublished: 3,
    decksFinished: 1,
    decks: 2,
    pointsEarned: 21,
    pointsPossible: 25,
    ...overrides,
  };
}

const classes = [
  { id: "c1", code: "INTE 301", title: "Architecture 1" },
  { id: "c2", code: "COMP 018", title: "Database Administration" },
  { id: "c3", code: "COMP 015", title: "Research Writing" },
];

const altitude: Altitude = {
  overall: 2354,
  classes: [
    classAltitude("c1"),
    classAltitude("c2", { meters: 3000, lessonsDone: 2, lessonsPublished: 2, decksFinished: 0, decks: 0, pointsEarned: 0, pointsPossible: 0 }),
    classAltitude("c3", { counts: false, meters: 0, lessonsDone: 0, lessonsPublished: 0, decksFinished: 0, decks: 0, pointsEarned: 0, pointsPossible: 0 }),
  ],
};

describe("AltitudeView", () => {
  it("shows the overall altitude on the meter", () => {
    const { container } = render(<AltitudeView altitude={altitude} classes={classes} />);
    const section = within(screen.getByRole("region", { name: "Altitude" }));
    expect(section.getByText("Your altitude").parentElement?.textContent).toContain("2,354 m");
    expect(container.querySelector<HTMLElement>("[data-marker]")?.style.top).toBe("21.5%");
    expect(section.getByText("The average across your classes that count.")).toBeTruthy();
  });

  it("shows one row per class with the title, the meters and the breakdown", () => {
    render(<AltitudeView altitude={altitude} classes={classes} />);
    const rows = within(screen.getByRole("region", { name: "Altitude" })).getAllByRole("listitem");
    expect(rows).toHaveLength(3);
    expect(rows[0].textContent).toContain("INTE 301");
    expect(rows[0].textContent).toContain("Architecture 1");
    expect(within(rows[0]).getByText("1,708 m").getAttribute("aria-hidden")).toBe("true");
    expect(within(rows[0]).getByText("1,708 meters")).toBeTruthy();
    expect(within(rows[0]).getByText("Lessons 1 of 3 · Decks 1 of 2 · Points 21 of 25")).toBeTruthy();
    expect(within(rows[0]).queryByText(/^Based on/)).toBeNull();
  });

  it("explains a class that rests on some parts only", () => {
    render(<AltitudeView altitude={altitude} classes={classes} />);
    const row = within(screen.getAllByRole("listitem")[1]);
    expect(row.getByText("3,000 meters")).toBeTruthy();
    expect(row.getByText("Lessons 2 of 2 · No decks yet · No graded work yet")).toBeTruthy();
    expect(row.getByText("Based on lessons only.")).toBeTruthy();
  });

  it("says a class with nothing to count is left out, also when the database has no row for it", () => {
    render(<AltitudeView altitude={{ ...altitude, classes: altitude.classes.slice(0, 1) }} classes={classes} />);
    for (const row of screen.getAllByRole("listitem").slice(1)) {
      expect(within(row).getByText("0 meters")).toBeTruthy();
      expect(within(row).getByText("Nothing to count yet. This class is left out of your average.")).toBeTruthy();
    }
  });

  it("says when nothing counts yet", () => {
    render(<AltitudeView altitude={{ overall: 0, classes: [altitude.classes[2]] }} classes={[classes[2]]} />);
    expect(screen.getByText("Starts counting when a class has lessons, decks or graded work.")).toBeTruthy();
    expect(screen.getByText("Your altitude").parentElement?.textContent).toContain("0 m");
  });

  it("says altitude is progress, with the weights", () => {
    render(<AltitudeView altitude={altitude} classes={classes} />);
    expect(
      screen.getByText(
        "Altitude is progress, not a grade. Lessons count for 1,200 m, decks for 600 m and graded work for 1,200 m. A part with nothing to count is skipped and the rest is scaled up.",
      ),
    ).toBeTruthy();
  });

  it("shows the empty state with no classes", () => {
    render(<AltitudeView altitude={{ overall: 0, classes: [] }} classes={[]} />);
    expect(screen.getByText("No classes yet. Join a class to start climbing.")).toBeTruthy();
    expect(screen.queryByRole("listitem")).toBeNull();
    expect(screen.queryByText("Your altitude")).toBeNull();
    expect(screen.getAllByRole("heading", { level: 2 }).map((heading) => heading.textContent)).toEqual(["Altitude"]);
  });

  it("renders a class title with markup as text", () => {
    const risky = [{ ...classes[0], title: "<img src=x onerror=alert(1)>" }];
    const { container } = render(<AltitudeView altitude={altitude} classes={risky} />);
    expect(container.querySelector("img")).toBeNull();
    expect(screen.getByText("<img src=x onerror=alert(1)>")).toBeTruthy();
  });
});

describe("AltitudePanel", () => {
  it("loads the altitude once for the signed in student and shows the rows", async () => {
    loadAltitude.mockResolvedValue(altitude);
    listStudentClasses.mockResolvedValue(classes.map((item) => ({ ...item, section: "", term: "", teacherName: "Teacher" })));
    render(await AltitudePanel({ user: { id: "student-1", fullName: "Ana Reyes", role: "student" } }));
    expect(loadAltitude).toHaveBeenCalledTimes(1);
    expect(loadAltitude).toHaveBeenCalledWith(client, "student-1");
    expect(listStudentClasses).toHaveBeenCalledTimes(1);
    expect(listStudentClasses).toHaveBeenCalledWith(client, "student-1");
    expect(screen.getAllByRole("listitem")).toHaveLength(3);
    expect(screen.getByText("Your altitude").parentElement?.textContent).toContain("2,354 m");
  });
});
