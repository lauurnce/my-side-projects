import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { HubHero, HubLayers, type HubClass } from "@/components/hub/Hub";
import { attemptOn, cellOn, fixedNow, openOn, pastDue, quiz, upload } from "@/components/ops/list/fixtures";
import type { DeckSummary } from "@/lib/decks";
import type { Altitude, ClassAltitude } from "@/lib/grades";

afterEach(cleanup);

const sampleClass = (index: number, progress: Partial<HubClass> = {}): HubClass => ({
  id: `class-${index}`,
  code: `COMP 01${index}`,
  title: `Class ${index}`,
  section: "BSIT 3-3",
  done: 0,
  published: 0,
  drafts: 0,
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
const halfway = sampleClass(1, { done: 2, published: 4, next: nextLesson });
const finished = sampleClass(2, { done: 3, published: 3 });

const classAltitude = (index: number, overrides: Partial<ClassAltitude> = {}): ClassAltitude => ({
  classId: `class-${index}`,
  counts: true,
  meters: 0,
  lessonsDone: 0,
  lessonsPublished: 0,
  decksFinished: 0,
  decks: 0,
  pointsEarned: 0,
  pointsPossible: 0,
  ...overrides,
});

const altitude: Altitude = {
  overall: 2354,
  classes: [
    classAltitude(1, { meters: 1708, lessonsDone: 2, lessonsPublished: 4, decksFinished: 1, decks: 2, pointsEarned: 21, pointsPossible: 25 }),
    classAltitude(2, { meters: 3000, lessonsDone: 3, lessonsPublished: 3 }),
  ],
};
const nothingCounts: Altitude = { overall: 0, classes: [classAltitude(1, { counts: false, meters: 900 })] };

describe("HubHero", () => {
  it("shows a student the overall altitude from the database in the headline and the meter", () => {
    const { container } = render(<HubHero role="student" classes={[halfway, finished]} altitude={altitude} />);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toMatch(/You.re at\s*2,354 m/);
    expect(screen.getByText("Your altitude").parentElement?.textContent).toContain("2,354 m");
    expect(screen.getByText("Your altitude is the average across your classes.")).toBeTruthy();
    expect(container.querySelector<HTMLElement>("[data-marker]")?.style.top).toBe("21.5%");
  });

  it("does not work the altitude out from lesson counts", () => {
    render(<HubHero role="student" classes={[halfway, finished]} altitude={{ ...altitude, overall: 1700 }} />);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toMatch(/You.re at\s*1,700 m/);
    expect(screen.getByText("Your altitude").parentElement?.textContent).toContain("1,700 m");
  });

  it("shows a student with nothing 0 m and says why", () => {
    render(<HubHero role="student" classes={[]} />);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toMatch(/You.re at\s*0 m/);
    expect(
      screen.getByText("Altitude starts counting when your classes have lessons, decks or graded work."),
    ).toBeTruthy();
    expect(screen.getByText("Your altitude")).toBeTruthy();
  });

  it("says why when a student has classes but none counts yet", () => {
    render(<HubHero role="student" classes={[halfway]} altitude={nothingCounts} />);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toMatch(/You.re at\s*0 m/);
    expect(
      screen.getByText("Altitude starts counting when your classes have lessons, decks or graded work."),
    ).toBeTruthy();
    expect(screen.queryByText("Your altitude is the average across your classes.")).toBeNull();
  });

  it("shows a teacher the class count and no altitude", () => {
    render(
      <HubHero
        role="teacher"
        classes={[sampleClass(1, { published: 4, drafts: 1 }), sampleClass(2, { published: 2 })]}
        altitude={altitude}
      />,
    );
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

const liveOn = (deckId: string) => ({ deckId, classId: "class-1", sessionId: `session-${deckId}`, slide: 2 });

describe("HubHero live row", () => {
  it("offers a student the live deck", () => {
    const decks = [sampleDeck(1), sampleDeck(2, { title: "Broker tour" })];
    render(<HubHero role="student" classes={[halfway]} decks={decks} live={[liveOn("deck-2")]} />);
    const link = screen.getByRole("link", { name: "Join live" });
    expect(link.getAttribute("href")).toBe("/decks/deck-2");
    const rowText = link.parentElement?.textContent;
    expect(rowText).toContain("Live");
    expect(rowText).toContain("Broker tour");
    expect(rowText).not.toMatch(/more/);
    expect(link.parentElement?.querySelector('[data-status="live"]')?.textContent).toBe("Live");
    expect(screen.queryByRole("link", { name: "Open the presenter view" })).toBeNull();
  });

  it("offers a teacher the presenter view", () => {
    render(<HubHero role="teacher" classes={[halfway]} decks={[sampleDeck(1)]} live={[liveOn("deck-1")]} />);
    expect(screen.getByRole("link", { name: "Open the presenter view" }).getAttribute("href")).toBe("/decks/deck-1");
    expect(screen.queryByRole("link", { name: "Join live" })).toBeNull();
  });

  it("shows the first live deck by title and counts the others", () => {
    const decks = [
      sampleDeck(1, { title: "Queues" }),
      sampleDeck(2, { title: "Topics" }),
      sampleDeck(3, { title: "Brokers" }),
      sampleDeck(4, { title: "Adapters" }),
    ];
    render(
      <HubHero
        role="student"
        classes={[halfway]}
        decks={decks}
        live={[liveOn("deck-1"), liveOn("deck-2"), liveOn("deck-3")]}
      />,
    );
    const links = screen.getAllByRole("link", { name: "Join live" });
    expect(links).toHaveLength(1);
    expect(links[0].getAttribute("href")).toBe("/decks/deck-3");
    expect(links[0].parentElement?.textContent).toContain("Brokers");
    expect(screen.getByText("and 2 more")).toBeTruthy();
  });

  it("shows no live row without a session, for an unknown deck or one that is not ready", () => {
    const decks = [sampleDeck(1), sampleDeck(2, { ready: false })];
    const { container } = render(<HubHero role="student" classes={[halfway]} decks={decks} />);
    expect(container.querySelector('[data-status="live"]')).toBeNull();
    cleanup();
    const other = render(
      <HubHero role="student" classes={[halfway]} decks={decks} live={[liveOn("deck-2"), liveOn("deck-9")]} />,
    );
    expect(other.container.querySelector('[data-status="live"]')).toBeNull();
    expect(screen.queryByRole("link", { name: "Join live" })).toBeNull();
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
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

  it("shows a student real progress and the database altitude on each route card", () => {
    render(<HubLayers role="student" classes={[halfway, finished]} altitude={altitude} />);
    const cards = within(screen.getByRole("region", { name: "Routes" })).getAllByRole("listitem");
    expect(cards[0].textContent).toContain("Lesson 2 of 4");
    expect(cards[0].textContent).toContain("1,708 meters");
    expect(cards[1].textContent).toContain("Lesson 3 of 3");
    expect(cards[1].textContent).toContain("3,000 meters");
    expect(within(cards[0]).getByRole("link").getAttribute("href")).toBe("/classes/class-1");
  });

  it("shows 0 m on the card of a class that does not count or is unknown", () => {
    render(<HubLayers role="student" classes={[halfway, finished]} altitude={nothingCounts} />);
    const cards = within(screen.getByRole("region", { name: "Routes" })).getAllByRole("listitem");
    expect(cards[0].textContent).toContain("Lesson 2 of 4");
    expect(cards[0].textContent).toContain("0 meters");
    expect(cards[0].textContent).not.toContain("900");
    expect(cards[1].textContent).toContain("0 meters");
  });

  it("shows a student the altitude line under the routes with a link to the grades", () => {
    render(<HubLayers role="student" classes={[halfway, finished]} altitude={{ ...altitude, overall: 1700 }} />);
    const routes = within(screen.getByRole("region", { name: "Routes" }));
    expect(routes.getByText("1,700 m of 3,000 m")).toBeTruthy();
    expect(routes.getByRole("link", { name: "See how it adds up" }).getAttribute("href")).toBe("/grades");
  });

  it("shows no altitude line to a student with no classes or to a teacher", () => {
    render(<HubLayers role="student" classes={[]} altitude={altitude} />);
    expect(screen.queryByText(/m of 3,000 m/)).toBeNull();
    cleanup();
    render(<HubLayers role="teacher" classes={[halfway, finished]} altitude={altitude} />);
    expect(screen.queryByText(/m of 3,000 m/)).toBeNull();
    expect(screen.queryByRole("link", { name: "See how it adds up" })).toBeNull();
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
    render(<HubLayers role="teacher" classes={classes} altitude={altitude} />);
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

  it("says Live now in the Decks head and marks the live thumb", () => {
    const decks = [sampleDeck(1), sampleDeck(2)];
    render(<HubLayers role="student" classes={[halfway]} decks={decks} live={[liveOn("deck-2")]} />);
    const region = screen.getByRole("region", { name: "Decks" });
    const panel = within(region);
    expect(panel.getByText("Live now").closest("[data-status]")?.getAttribute("data-status")).toBe("live");
    expect(region.querySelectorAll('[data-status="live"]')).toHaveLength(1);
    const links = panel.getAllByRole("link");
    expect(links.map((link) => link.getAttribute("href"))).toEqual(["/decks/deck-2", "/decks/deck-1"]);
    expect(links[0].textContent).toContain("LIVE");
    expect(links[1].textContent).not.toContain("LIVE");
    expect(within(screen.getByRole("region", { name: "Routes" })).queryByText("Live now")).toBeNull();
  });

  it("keeps a live deck among the six shown", () => {
    const decks = [1, 2, 3, 4, 5, 6, 7, 8].map((index) => sampleDeck(index));
    render(<HubLayers role="student" classes={[halfway]} decks={decks} live={[liveOn("deck-8")]} />);
    const items = within(screen.getByRole("region", { name: "Decks" })).getAllByRole("listitem");
    expect(items).toHaveLength(6);
    expect(within(items[0]).getByRole("link").getAttribute("href")).toBe("/decks/deck-8");
    expect(items[0].textContent).toContain("LIVE");
  });

  it("shows a teacher Live now and a Live chip on the row", () => {
    render(<HubLayers role="teacher" classes={[halfway]} decks={[sampleDeck(1), sampleDeck(2)]} live={[liveOn("deck-2")]} />);
    const panel = within(screen.getByRole("region", { name: "Decks" }));
    expect(panel.getByText("Live now")).toBeTruthy();
    const links = panel.getAllByRole("link");
    expect(links[0].getAttribute("href")).toBe("/decks/deck-2");
    expect(within(links[0]).getByText("Live")).toBeTruthy();
    expect(within(links[1]).queryByText("Live")).toBeNull();
  });

  it("shows no live marker when no deck is live or the live deck is not ready", () => {
    const decks = [sampleDeck(1), sampleDeck(2, { ready: false })];
    const { container } = render(
      <HubLayers role="student" classes={[halfway]} decks={decks} live={[liveOn("deck-2")]} />,
    );
    expect(container.querySelector('[data-status="live"]')).toBeNull();
    expect(screen.queryByText("LIVE")).toBeNull();
    expect(screen.queryByText("Live now")).toBeNull();
  });
});

const opsActivities = [
  quiz("closed", { title: "Gateways", dueAt: pastDue }),
  quiz("done", { title: "Topics", classId: "class-2" }),
  quiz("later", { title: "Adapters", dueAt: "2026-12-05T15:59:00.000Z" }),
  quiz("undated", { title: "Patterns", dueAt: null }),
  quiz("soon", { title: "Message brokers" }),
  quiz("running", { title: "Queues" }),
  quiz("draft", { title: "Unpublished quiz", publishedAt: null }),
];
const studentOps = { activities: opsActivities, attempts: [attemptOn("done"), openOn("running")], now: fixedNow };

describe("HubHero next due row", () => {
  it("links a student to the open activity with the nearest due date", () => {
    render(<HubHero role="student" classes={[halfway]} ops={studentOps} />);
    const link = screen.getByRole("link", { name: "Next due: Message brokers, Nov 28, 11:59 PM" });
    expect(link.getAttribute("href")).toBe("/ops/soon");
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
  });

  it("shows no row without an open activity that has a due date", () => {
    const ops = { ...studentOps, activities: opsActivities.filter((item) => !["soon", "later"].includes(item.id)) };
    render(<HubHero role="student" classes={[halfway]} ops={ops} />);
    expect(screen.queryByText(/Next due/)).toBeNull();
    cleanup();
    render(<HubHero role="student" classes={[halfway]} />);
    expect(screen.queryByText(/Next due/)).toBeNull();
  });

  it("shows no row to a teacher", () => {
    render(<HubHero role="teacher" classes={[halfway]} ops={{ ...studentOps, attempts: [] }} />);
    expect(screen.queryByText(/Next due/)).toBeNull();
  });
});

describe("HubLayers Ops panel", () => {
  it("shows a student the due count and five cards in order, with the class code", () => {
    render(<HubLayers role="student" classes={[halfway, finished]} ops={studentOps} />);
    const region = screen.getByRole("region", { name: "Ops" });
    const panel = within(region);
    expect(panel.getByText("4 due")).toBeTruthy();
    const links = panel.getAllByRole("link").filter((link) => link.getAttribute("href")?.startsWith("/ops/"));
    expect(links.map((link) => link.getAttribute("href"))).toEqual([
      "/ops/running",
      "/ops/soon",
      "/ops/later",
      "/ops/undated",
      "/ops/done",
    ]);
    expect(links[0].textContent).toContain("Quiz · COMP 011");
    expect(links[4].textContent).toContain("Quiz · COMP 012");
    expect(links.map((link) => link.querySelector("[data-status]")?.textContent)).toEqual([
      "In progress",
      "Due Nov 28, 11:59 PM",
      "Due Dec 5, 11:59 PM",
      "No due date",
      "Graded · 4 of 5",
    ]);
    expect(links.map((link) => link.querySelector("[data-status]")?.getAttribute("data-status"))).toEqual([
      "submitted",
      "due",
      "due",
      "due",
      "graded",
    ]);
    expect(panel.getByRole("link", { name: "See all in your classes" }).getAttribute("href")).toBe("/classes");
    expect(panel.queryByText("Nothing due")).toBeNull();
    expect(panel.queryByText("Unpublished quiz")).toBeNull();
    expect(region.querySelector('[data-status="late"]')).toBeNull();
  });

  it("shows no link to the rest with five or fewer", () => {
    const ops = { ...studentOps, activities: opsActivities.slice(0, 5) };
    render(<HubLayers role="student" classes={[halfway]} ops={ops} />);
    const panel = within(screen.getByRole("region", { name: "Ops" }));
    expect(panel.getAllByRole("listitem")).toHaveLength(5);
    expect(panel.queryByRole("link", { name: "See all in your classes" })).toBeNull();
  });

  it("keeps the empty state when a student only has drafts in the data", () => {
    const ops = { ...studentOps, activities: [opsActivities[6]] };
    render(<HubLayers role="student" classes={[halfway]} ops={ops} />);
    const panel = within(screen.getByRole("region", { name: "Ops" }));
    expect(panel.getByText("0 due")).toBeTruthy();
    expect(panel.getByText("Nothing due")).toBeTruthy();
    expect(panel.getByText("Quizzes, uploads and threads show up here when a class has them.")).toBeTruthy();
    expect(panel.queryByRole("link")).toBeNull();
  });

  it("shows a teacher a compact list with drafts, newest first, and no attempt chips", () => {
    const ops = { activities: opsActivities.slice(3), attempts: [], now: fixedNow };
    render(<HubLayers role="teacher" classes={[halfway, finished]} ops={ops} />);
    const region = screen.getByRole("region", { name: "Ops" });
    const panel = within(region);
    expect(panel.getByText("4 activities")).toBeTruthy();
    const links = panel.getAllByRole("link");
    expect(links.map((link) => link.getAttribute("href"))).toEqual([
      "/ops/draft",
      "/ops/running",
      "/ops/soon",
      "/ops/undated",
    ]);
    expect(links[0].textContent).toBe("Unpublished quizCOMP 011Draft");
    expect(links[1].textContent).toBe("QueuesCOMP 011Published");
    expect(region.querySelector("[data-status]")).toBeNull();
    expect(panel.queryByText("Nothing due")).toBeNull();
  });

  it("links a teacher to the rest past five and keeps the empty state with none", () => {
    render(<HubLayers role="teacher" classes={[halfway]} ops={{ ...studentOps, attempts: [] }} />);
    const panel = within(screen.getByRole("region", { name: "Ops" }));
    expect(panel.getByText("7 activities")).toBeTruthy();
    expect(panel.getAllByRole("listitem")).toHaveLength(5);
    expect(panel.getByRole("link", { name: "See all in your classes" }).getAttribute("href")).toBe("/classes");
    cleanup();
    render(<HubLayers role="teacher" classes={[halfway]} />);
    expect(within(screen.getByRole("region", { name: "Ops" })).getByText("Nothing due")).toBeTruthy();
  });
});

describe("HubLayers Ops panel with upload activities", () => {
  const ops = {
    activities: [
      upload("handed", { title: "Chapter 1" }),
      quiz("soon", { title: "Message brokers" }),
      upload("draft", { title: "Chapter 3 draft", dueAt: "2026-11-27T15:59:00.000Z" }),
      upload("missed", { title: "Chapter 2", dueAt: pastDue }),
      upload("scored", { title: "Outline" }),
    ],
    attempts: [],
    cells: [
      cellOn("handed", { state: "submitted", late: true, submittedAt: "2026-11-27T01:00:00.000Z" }),
      cellOn("missed", { state: "missing" }),
      cellOn("scored", { state: "graded", score: 18 }),
    ],
    now: fixedNow,
  };

  it("orders an upload not yet handed in like an open quiz and counts it as due", () => {
    render(<HubLayers role="student" classes={[halfway]} ops={ops} />);
    const panel = within(screen.getByRole("region", { name: "Ops" }));
    expect(panel.getByText("3 due")).toBeTruthy();
    const links = panel.getAllByRole("link");
    expect(links.map((link) => link.getAttribute("href"))).toEqual([
      "/ops/missed",
      "/ops/draft",
      "/ops/soon",
      "/ops/handed",
      "/ops/scored",
    ]);
    expect(links[1].textContent).toContain("Upload · COMP 011");
    expect(links[1].textContent).toContain("20 points · PDF or DOCX");
    expect(links.map((link) => [...link.querySelectorAll("[data-status]")].map((chip) => chip.textContent))).toEqual([
      ["Missing"],
      ["Due Nov 27, 11:59 PM"],
      ["Due Nov 28, 11:59 PM"],
      ["Submitted", "Late"],
      ["Graded · 18 of 20"],
    ]);
  });

  it("points the next due row at an upload that is not past due", () => {
    render(<HubHero role="student" classes={[halfway]} ops={ops} />);
    const link = screen.getByRole("link", { name: "Next due: Chapter 3 draft, Nov 27, 11:59 PM" });
    expect(link.getAttribute("href")).toBe("/ops/draft");
  });
});
