import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { HubHero, HubLayers, type HubClass } from "@/components/hub/Hub";

afterEach(cleanup);

const sampleClass = (index: number): HubClass => ({
  id: `class-${index}`,
  code: `COMP 01${index}`,
  title: `Class ${index}`,
  section: "BSIT 3-3",
});

describe("HubHero", () => {
  it("shows the altitude headline at 0 m", () => {
    render(<HubHero role="student" classes={[]} />);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toMatch(/You.re at\s*0 m/);
  });

  it("sends a student with no classes to join one", () => {
    render(<HubHero role="student" classes={[]} />);
    const link = screen.getByRole("link", { name: /Join a class/ });
    expect(link.getAttribute("href")).toBe("/classes");
  });

  it("sends a teacher with no classes to create one", () => {
    render(<HubHero role="teacher" classes={[]} />);
    expect(screen.getByRole("link", { name: /Create a class/ })).toBeTruthy();
  });

  it("opens classes once there are some", () => {
    render(<HubHero role="student" classes={[sampleClass(1)]} />);
    expect(screen.getByRole("link", { name: /Open classes/ })).toBeTruthy();
    expect(screen.getByText("1 class")).toBeTruthy();
  });
});

describe("HubLayers", () => {
  it("has the three layers as headings", () => {
    render(<HubLayers role="student" classes={[]} />);
    expect(screen.getAllByRole("heading", { level: 2 }).map((heading) => heading.textContent)).toEqual([
      "Routes",
      "Decks",
      "Ops",
    ]);
  });

  it("shows honest empty states", () => {
    render(<HubLayers role="student" classes={[]} />);
    expect(screen.getByText("No classes yet")).toBeTruthy();
    expect(screen.getByText("Enter a join code from your teacher.")).toBeTruthy();
    expect(screen.getByText("No decks yet")).toBeTruthy();
    expect(screen.getByText("Nothing due")).toBeTruthy();
  });

  it("links each real class to its page", () => {
    render(<HubLayers role="teacher" classes={[sampleClass(1), sampleClass(2)]} />);
    const routes = screen.getByRole("region", { name: "Routes" });
    const links = within(routes).getAllByRole("link");
    expect(links.map((link) => link.getAttribute("href"))).toEqual(["/classes/class-1", "/classes/class-2"]);
  });

  it("shows three classes and a link to the rest", () => {
    render(<HubLayers role="teacher" classes={[1, 2, 3, 4, 5].map(sampleClass)} />);
    const routes = screen.getByRole("region", { name: "Routes" });
    expect(within(routes).getAllByRole("listitem")).toHaveLength(3);
    expect(within(routes).getByRole("link", { name: "See all 5 classes" }).getAttribute("href")).toBe("/classes");
  });
});
