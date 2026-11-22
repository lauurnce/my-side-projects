import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { HubHero, HubLayers, type HubClass } from "@/components/hub/Hub";
import type { DeckSummary } from "@/lib/decks";

afterEach(cleanup);

const sampleClass = (index: number, progress: Partial<HubClass> = {}): HubClass => ({
  id: `class-${index}`,
  code: `COMP 01${index}`,
  title: `Class ${index}`,
  section: "BSIT 3-3",
  done: 0,
  published: 0,
  drafts: 0,
  meters: 0,
  next: null,
  ...progress,
});

const sampleDeck = (index: number, overrides: Partial<DeckSummary> = {}): DeckSummary => ({
  id: `deck-${index}`,
  classId: "class-1",
  lessonId: null,
  title: `Deck ${index}`,
  kind: "pdf",
  slideCount: 24,
  sizeBytes: 1000,
  ready: true,
  viewedCount: 0,
  ...overrides,
});

const nextLesson = { id: "lesson-9", moduleId: "m1", title: "Message queues", estMinutes: 10, published: true, done: false };
const halfway = sampleClass(1, { done: 2, published: 4, meters: 1500, next: nextLesson });
const finished = sampleClass(2, { done: 3, published: 3, meters: 3000 });

describe("HubHero", () => {
  it("shows a student the mean altitude in the headline and the meter", () => {
    render(<HubHero role="student" classes={[halfway, finished]} />);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toMatch(/You.re at\s*2,250 m/);
    expect(screen.getByText("Your altitude").parentElement?.textContent).toContain("2,250 m");
    expect(screen.getByText("Your altitude is the average across your classes.")).toBeTruthy();
  });

  it("shows a student with nothing 0 m and says why", () => {
    render(<HubHero role="student" classes={[]} />);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toMatch(/You.re at\s*0 m/);
    expect(screen.getByText("Altitude starts counting when your classes have lessons.")).toBeTruthy();
    expect(screen.getByText("Your altitude")).toBeTruthy();
  });

  it("shows a teacher the class count and no altitude", () => {
    render(<HubHero role="teacher" classes={[sampleClass(1, { published: 4, drafts: 1 }), sampleClass(2, { published: 2 })]} />);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toMatch(/You teach\s*2 classes/);
    expect(screen.getByText("6 published and 1 draft across your classes.")).toBeTruthy();
    expect(screen.queryByText("Your altitude")).toBeNull();
    expect(screen.queryByText(/\d m$/)).toBeNull();
  });

  it("words one class for a teacher", () => {
    render(<HubHero role="teacher" classes={[sampleClass(1)]} />);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toMatch(/You teach\s*1 class$/);
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
    expect(screen.getByText("0 decks")).toBeTruthy();
    expect(screen.getByText("Nothing due")).toBeTruthy();
    expect(screen.queryByText("Continue where you left off")).toBeNull();
  });

  it("shows a student real decks with the class code and the totals", () => {
    const decks = [sampleDeck(1, { viewedCount: 9 }), sampleDeck(2, { classId: "class-2", slideCount: 72, viewedCount: 22 })];
    render(<HubLayers role="student" classes={[halfway, finished]} decks={decks} />);
    const panel = within(screen.getByRole("region", { name: "Decks" }));
    expect(panel.getByText("2 decks")).toBeTruthy();
    const links = panel.getAllByRole("link");
    expect(links.map((link) => link.getAttribute("href"))).toEqual(["/decks/deck-1", "/decks/deck-2"]);
    expect(links[0].textContent).toContain("COMP 011");
    expect(links[0].textContent).toContain("Deck 1");
    expect(links[1].textContent).toContain("COMP 012");
    expect(panel.getByText("Viewed 31 of 96 slides")).toBeTruthy();
    expect(panel.queryByText("No decks yet")).toBeNull();
    expect(panel.queryByText("See all in your classes")).toBeNull();
  });

  it("shows six decks and a link to the rest", () => {
    const decks = [1, 2, 3, 4, 5, 6, 7].map((index) => sampleDeck(index));
    render(<HubLayers role="student" classes={[halfway]} decks={decks} />);
    const panel = within(screen.getByRole("region", { name: "Decks" }));
    expect(panel.getByText("7 decks")).toBeTruthy();
    expect(panel.getAllByRole("listitem")).toHaveLength(6);
    expect(panel.getByRole("link", { name: "See all in your classes" }).getAttribute("href")).toBe("/classes");
    expect(panel.getByText("Viewed 0 of 168 slides")).toBeTruthy();
  });

  it("shows a teacher only ready decks as a list with no viewed line", () => {
    const decks = [sampleDeck(1), sampleDeck(2, { ready: false, slideCount: 0 }), sampleDeck(3, { kind: "native" })];
    render(<HubLayers role="teacher" classes={[halfway]} decks={decks} />);
    const region = screen.getByRole("region", { name: "Decks" });
    const panel = within(region);
    expect(panel.getByText("2 decks")).toBeTruthy();
    const links = panel.getAllByRole("link");
    expect(links.map((link) => link.getAttribute("href"))).toEqual(["/decks/deck-1", "/decks/deck-3"]);
    expect(links[1].textContent).toBe("Deck 324 slides · PPTXCOMP 011");
    expect(region.textContent).not.toMatch(/Viewed/);
  });

  it("keeps the empty state when a teacher has only unfinished uploads", () => {
    render(<HubLayers role="teacher" classes={[halfway]} decks={[sampleDeck(1, { ready: false })]} />);
    const panel = within(screen.getByRole("region", { name: "Decks" }));
    expect(panel.getByText("0 decks")).toBeTruthy();
    expect(panel.getByText("No decks yet")).toBeTruthy();
    expect(panel.getByText("Decks show up here when a teacher uploads one to a class.")).toBeTruthy();
    expect(panel.queryByRole("link")).toBeNull();
  });

  it("shows a student real progress on each route card", () => {
    render(<HubLayers role="student" classes={[halfway, finished]} />);
    const cards = within(screen.getByRole("region", { name: "Routes" })).getAllByRole("listitem");
    expect(cards[0].textContent).toContain("Lesson 2 of 4");
    expect(cards[0].textContent).toContain("1,500 meters");
    expect(cards[1].textContent).toContain("Lesson 3 of 3");
    expect(cards[1].textContent).toContain("3,000 meters");
    expect(within(cards[0]).getByRole("link").getAttribute("href")).toBe("/classes/class-1");
  });

  it("offers a student the next unfinished lesson", () => {
    render(<HubLayers role="student" classes={[finished, halfway]} />);
    const routes = screen.getByRole("region", { name: "Routes" });
    expect(within(routes).getByText("Continue where you left off")).toBeTruthy();
    const link = within(routes).getByRole("link", { name: /Next lesson/ });
    expect(link.getAttribute("href")).toBe("/classes/class-1/lessons/lesson-9");
    expect(link.textContent).toContain("Message queues");
    expect(within(routes).getByText("COMP 011", { selector: "div > span" })).toBeTruthy();
  });

  it("tells a student who finished everything they are up to date", () => {
    render(<HubLayers role="student" classes={[finished]} />);
    expect(screen.getByText("You are up to date.")).toBeTruthy();
    expect(screen.queryByRole("link", { name: /Next lesson/ })).toBeNull();
  });

  it("hides the continue card when no class has lessons", () => {
    render(<HubLayers role="student" classes={[sampleClass(1), sampleClass(2)]} />);
    expect(screen.queryByText("Continue where you left off")).toBeNull();
    expect(screen.queryByText("You are up to date.")).toBeNull();
    expect(screen.getAllByText("Lesson 0 of 0")).toHaveLength(2);
  });

  it("shows a teacher published and draft counts with no altitude or continue card", () => {
    const classes = [sampleClass(1, { published: 4, drafts: 1, next: nextLesson }), sampleClass(2)];
    render(<HubLayers role="teacher" classes={classes} />);
    const routes = screen.getByRole("region", { name: "Routes" });
    const links = within(routes).getAllByRole("link");
    expect(links.map((link) => link.getAttribute("href"))).toEqual(["/classes/class-1", "/classes/class-2"]);
    expect(links[0].textContent).toContain("4 published · 1 draft");
    expect(links[1].textContent).toContain("0 published · 0 drafts");
    expect(routes.textContent).not.toMatch(/meters|Lesson \d|Continue/);
  });

  it("shows three classes and a link to the rest", () => {
    render(<HubLayers role="teacher" classes={[1, 2, 3, 4, 5].map((index) => sampleClass(index))} />);
    const routes = screen.getByRole("region", { name: "Routes" });
    expect(within(routes).getAllByRole("listitem")).toHaveLength(3);
    expect(within(routes).getByRole("link", { name: "See all 5 classes" }).getAttribute("href")).toBe("/classes");
  });

  it("continues a class beyond the three shown", () => {
    const classes = [finished, sampleClass(3), sampleClass(4), sampleClass(5, { published: 1, next: nextLesson })];
    render(<HubLayers role="student" classes={classes} />);
    expect(screen.getByRole("link", { name: /Next lesson/ }).getAttribute("href")).toBe(
      "/classes/class-5/lessons/lesson-9",
    );
  });
});
