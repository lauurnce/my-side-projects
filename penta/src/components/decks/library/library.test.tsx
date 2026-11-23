import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { DeckSummary } from "@/lib/decks";
import type { ClassOutline } from "@/lib/routes";
import { DeckLibrary } from "./DeckLibrary";
import { HubDeckList } from "./HubDeckList";
import { LessonDeck } from "./LessonDeck";

afterEach(cleanup);

function deck(id: string, overrides: Partial<DeckSummary> = {}): DeckSummary {
  return {
    id,
    classId: "c1",
    lessonId: null,
    title: `Deck ${id}`,
    kind: "pdf",
    slideCount: 24,
    sizeBytes: 1000,
    ready: true,
    viewedCount: 0,
    ...overrides,
  };
}

const outline: ClassOutline = {
  classId: "c1",
  modules: [
    {
      id: "m1",
      classId: "c1",
      title: "One",
      lessons: [{ id: "l1", moduleId: "m1", title: "Message queues", estMinutes: 5, published: true, done: false }],
    },
  ],
};

const classes = [
  { id: "c1", code: "INTE 301" },
  { id: "c2", code: "COMP 018" },
];

const longTitle = "W".repeat(120);

describe("DeckLibrary", () => {
  it("shows the heading, the count and one link per deck", () => {
    const decks = [deck("a", { lessonId: "l1", viewedCount: 5 }), deck("b", { kind: "pptx" }), deck("c")];
    render(<DeckLibrary decks={decks} classCode="INTE 301" outline={outline} />);
    expect(screen.getByRole("region", { name: "Decks" })).toBeTruthy();
    expect(screen.getByRole("heading", { level: 2 }).textContent).toBe("Decks");
    expect(screen.getByText("3 decks")).toBeTruthy();
    const links = screen.getAllByRole("link");
    expect(links.map((link) => link.getAttribute("href"))).toEqual(["/decks/a", "/decks/b", "/decks/c"]);
    expect(links[0].textContent).toContain("Message queues");
    expect(links[0].textContent).toContain("Deck a");
    expect(links[0].textContent).toContain("24 slides · PDF");
    expect(links[0].textContent).toContain("Viewed 5 / 24");
    expect(links[1].textContent).toContain("INTE 301");
    expect(links[1].textContent).toContain("24 slides · PPTX");
  });

  it("words one deck and never marks a deck live", () => {
    render(<DeckLibrary decks={[deck("a")]} classCode="INTE 301" outline={outline} />);
    expect(screen.getByText("1 deck")).toBeTruthy();
    expect(screen.queryByText("LIVE")).toBeNull();
  });

  it("leaves out a deck that is not ready", () => {
    render(<DeckLibrary decks={[deck("a"), deck("b", { ready: false })]} classCode="INTE 301" outline={outline} />);
    expect(screen.getAllByRole("link")).toHaveLength(1);
    expect(screen.getByText("1 deck")).toBeTruthy();
  });

  it("shows the empty state", () => {
    render(<DeckLibrary decks={[]} classCode="INTE 301" outline={outline} />);
    expect(screen.getByText("No decks yet. Decks show up here when your teacher uploads one.")).toBeTruthy();
    expect(screen.getByText("0 decks")).toBeTruthy();
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("renders a title with markup as text and keeps a long title whole", () => {
    const decks = [deck("a", { title: "<img src=x onerror=alert(1)>" }), deck("b", { title: longTitle })];
    const { container } = render(<DeckLibrary decks={decks} classCode="INTE 301" outline={outline} />);
    expect(container.querySelector("img")).toBeNull();
    expect(screen.getByText("<img src=x onerror=alert(1)>")).toBeTruthy();
    expect(screen.getByText(longTitle)).toBeTruthy();
  });
});

describe("LessonDeck", () => {
  it("renders nothing with no deck", () => {
    const { container } = render(<LessonDeck decks={[]} lessonTitle="Message queues" />);
    expect(container.innerHTML).toBe("");
  });

  it("shows the block title and a link per deck", () => {
    render(<LessonDeck decks={[deck("a"), deck("b")]} lessonTitle="Message queues" />);
    expect(screen.getByRole("region", { name: "Slides for this lesson" })).toBeTruthy();
    expect(screen.getByText("2 decks")).toBeTruthy();
    const links = screen.getAllByRole("link");
    expect(links.map((link) => link.getAttribute("href"))).toEqual(["/decks/a", "/decks/b"]);
    expect(links[0].textContent).toContain("Message queues");
  });
});

describe("HubDeckList", () => {
  const many = ["a", "b", "c", "d", "e", "f", "g", "h"].map((id) =>
    deck(id, { classId: id === "a" ? "c2" : "c1", viewedCount: 3 }),
  );

  it("shows a student thumbs with the class code and the totals", () => {
    render(<HubDeckList role="student" decks={many.slice(0, 2)} classes={classes} />);
    const links = screen.getAllByRole("link");
    expect(links.map((link) => link.getAttribute("href"))).toEqual(["/decks/a", "/decks/b"]);
    expect(links[0].textContent).toContain("COMP 018");
    expect(links[1].textContent).toContain("INTE 301");
    expect(links[0].textContent).toContain("Viewed 3 / 24");
    expect(screen.getByText("Viewed 6 of 48 slides")).toBeTruthy();
    expect(screen.queryByText("See all in your classes")).toBeNull();
  });

  it("shows six decks, counts all of them and links to the rest", () => {
    render(<HubDeckList role="student" decks={many} classes={classes} />);
    expect(screen.getAllByRole("listitem")).toHaveLength(6);
    expect(screen.getByText("Viewed 24 of 192 slides")).toBeTruthy();
    expect(screen.getByRole("link", { name: "See all in your classes" }).getAttribute("href")).toBe("/classes");
  });

  it("shows no link to the rest with exactly six", () => {
    render(<HubDeckList role="student" decks={many.slice(0, 6)} classes={classes} />);
    expect(screen.getAllByRole("listitem")).toHaveLength(6);
    expect(screen.queryByText("See all in your classes")).toBeNull();
  });

  it("shows a teacher a compact list with no viewed numbers", () => {
    const decks = [deck("a", { kind: "pptx", classId: "c2" }), deck("b", { slideCount: 1 })];
    const { container } = render(<HubDeckList role="teacher" decks={decks} classes={classes} />);
    const links = screen.getAllByRole("link");
    expect(links.map((link) => link.getAttribute("href"))).toEqual(["/decks/a", "/decks/b"]);
    expect(links[0].textContent).toBe("Deck a24 slides · PPTXCOMP 018");
    expect(links[1].textContent).toBe("Deck b1 slide · PDFINTE 301");
    expect(container.textContent).not.toMatch(/Viewed/);
  });

  it("links a teacher to the rest beyond six", () => {
    render(<HubDeckList role="teacher" decks={many} classes={classes} />);
    expect(screen.getAllByRole("listitem")).toHaveLength(6);
    expect(screen.getByRole("link", { name: "See all in your classes" })).toBeTruthy();
  });

  it("falls back to a plain word when the class is not loaded", () => {
    render(<HubDeckList role="teacher" decks={[deck("a", { classId: "gone" })]} classes={classes} />);
    expect(screen.getByRole("link").textContent).toBe("Deck a24 slides · PDFClass");
  });
});

describe("live decks in the library", () => {
  it("marks the live deck and says how to join above the grid", () => {
    const decks = [deck("a"), deck("b", { title: "Broker tour" }), deck("c")];
    render(<DeckLibrary decks={decks} classCode="INTE 301" outline={outline} liveIds={new Set(["b"])} />);
    expect(screen.getAllByText("LIVE")).toHaveLength(1);
    expect(screen.getByRole("link", { name: /Broker tour.*LIVE/ }).textContent).toContain("LIVE");
    const line = screen.getByText(/^Live now:/);
    expect(line.textContent).toBe("Live now: Broker tour. Open it and press Join live.");
    expect(within(line).getByRole("link", { name: "Broker tour" }).getAttribute("href")).toBe("/decks/b");
    const grid = screen.getByRole("list");
    expect(line.compareDocumentPosition(grid) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(within(grid).getAllByRole("link").map((link) => link.getAttribute("href"))).toEqual([
      "/decks/a",
      "/decks/b",
      "/decks/c",
    ]);
  });

  it("writes one line per live deck, by title", () => {
    const decks = [deck("a", { title: "Queues" }), deck("b", { title: "Brokers" })];
    render(<DeckLibrary decks={decks} classCode="INTE 301" outline={outline} liveIds={new Set(["a", "b"])} />);
    expect(screen.getAllByText(/^Live now:/).map((line) => line.textContent)).toEqual([
      "Live now: Brokers. Open it and press Join live.",
      "Live now: Queues. Open it and press Join live.",
    ]);
  });

  it("shows no line with no session or for a deck that is not ready", () => {
    render(
      <DeckLibrary
        decks={[deck("a"), deck("b", { ready: false })]}
        classCode="INTE 301"
        outline={outline}
        liveIds={new Set(["b", "gone"])}
      />,
    );
    expect(screen.queryByText(/Live now/)).toBeNull();
    expect(screen.queryByText("LIVE")).toBeNull();
  });

  it("renders a live title with markup as text", () => {
    const decks = [deck("a", { title: "<img src=x onerror=alert(1)>" })];
    const { container } = render(
      <DeckLibrary decks={decks} classCode="INTE 301" outline={outline} liveIds={new Set(["a"])} />,
    );
    expect(container.querySelector("img")).toBeNull();
    expect(screen.getByRole("link", { name: "<img src=x onerror=alert(1)>" })).toBeTruthy();
  });

  it("marks the live deck of a lesson", () => {
    render(<LessonDeck decks={[deck("a"), deck("b")]} lessonTitle="Message queues" liveIds={new Set(["a"])} />);
    const links = screen.getAllByRole("link");
    expect(links[0].textContent).toContain("LIVE");
    expect(links[1].textContent).not.toContain("LIVE");
  });

  it("never marks a lesson deck live without a session", () => {
    render(<LessonDeck decks={[deck("a")]} lessonTitle="Message queues" />);
    expect(screen.queryByText("LIVE")).toBeNull();
  });
});

describe("live decks on the hub list", () => {
  const many = ["a", "b", "c", "d", "e", "f", "g", "h"].map((id) => deck(id));

  it("shows a live deck first even when it is beyond the limit", () => {
    render(<HubDeckList role="student" decks={many} classes={classes} liveIds={new Set(["h"])} />);
    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(6);
    expect(within(items[0]).getByRole("link").getAttribute("href")).toBe("/decks/h");
    expect(items[0].textContent).toContain("LIVE");
    expect(within(items[1]).getByRole("link").getAttribute("href")).toBe("/decks/a");
    expect(screen.getAllByText("LIVE")).toHaveLength(1);
    expect(screen.getByText("Viewed 0 of 192 slides")).toBeTruthy();
  });

  it("keeps the order with no session", () => {
    render(<HubDeckList role="student" decks={many} classes={classes} />);
    const hrefs = screen.getAllByRole("listitem").map((item) => within(item).getByRole("link").getAttribute("href"));
    expect(hrefs).toEqual(["/decks/a", "/decks/b", "/decks/c", "/decks/d", "/decks/e", "/decks/f"]);
    expect(screen.queryByText("LIVE")).toBeNull();
  });

  it("gives a teacher a Live chip on the row, first in the list", () => {
    const { container } = render(<HubDeckList role="teacher" decks={many} classes={classes} liveIds={new Set(["g"])} />);
    const items = screen.getAllByRole("listitem");
    expect(within(items[0]).getByRole("link").getAttribute("href")).toBe("/decks/g");
    expect(within(items[0]).getByText("Live").closest("[data-status]")?.getAttribute("data-status")).toBe("live");
    expect(container.querySelectorAll('[data-status="live"]')).toHaveLength(1);
  });
});
