import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { DecksPanel } from "./DecksPanel";
import { OpsPanel } from "./OpsPanel";
import { RoutesPanel } from "./RoutesPanel";

afterEach(cleanup);

const focusable = "a, button, input, select, textarea, summary, [tabindex], [contenteditable]";

function focusableIn(container: HTMLElement) {
  return Array.from(container.querySelectorAll<HTMLElement>(focusable));
}

describe("RoutesPanel", () => {
  it("is a section named by its h2 and marked as sample data", () => {
    render(<RoutesPanel />);
    const heading = screen.getByRole("heading", { level: 2, name: "Routes" });
    expect(heading.id).toBe("routes-title");
    const section = heading.closest("section");
    expect(section?.id).toBe("routes");
    expect(section?.getAttribute("aria-labelledby")).toBe("routes-title");
    expect(section?.dataset.cover).toBe("1");
    expect(screen.getByText("Sample data")).toBeTruthy();
  });

  it("shows the feature card and three static route cards", () => {
    const { container } = render(<RoutesPanel />);
    expect(screen.getByText("Continue where you left off")).toBeTruthy();
    expect(screen.getByText("INTE 301")).toBeTruthy();
    expect(screen.getByText("Systems Integration and Architecture 1")).toBeTruthy();
    expect(screen.getByText("Database administration")).toBeTruthy();
    expect(screen.getByText("Web development")).toBeTruthy();
    expect(screen.getByText("Intro to data science")).toBeTruthy();
    expect(container.querySelectorAll("[data-fill]")).toHaveLength(3);
    expect(container.querySelector(".building-image")?.getAttribute("aria-hidden")).toBe("true");
    expect(container.querySelector("img")).toBeNull();
  });

  it("shows the altitude line", () => {
    render(<RoutesPanel />);
    expect(screen.getByText("0 m")).toBeTruthy();
    expect(screen.getByText("You · 1,840 m")).toBeTruthy();
    expect(screen.getByText("Summit 3,000 m")).toBeTruthy();
  });

  it("has nothing that takes focus", () => {
    const { container } = render(<RoutesPanel />);
    expect(focusableIn(container)).toHaveLength(0);
    expect(screen.getByText("Filters").tagName).toBe("SPAN");
  });
});

describe("DecksPanel", () => {
  it("is a deep section named by its h2 and marked as sample data", () => {
    render(<DecksPanel />);
    const heading = screen.getByRole("heading", { level: 2, name: "Decks" });
    expect(heading.id).toBe("decks-title");
    const section = heading.closest("section");
    expect(section?.id).toBe("decks");
    expect(section?.dataset.cover).toBe("2");
    expect(section?.dataset.deep).toBe("true");
    expect(screen.getByText("Sample data")).toBeTruthy();
  });

  it("shows the live chip and the slide", () => {
    render(<DecksPanel />);
    expect(screen.getByText("Live now · INTE 301")).toBeTruthy();
    expect(screen.getByText("Producer")).toBeTruthy();
    expect(screen.getByText("Broker")).toBeTruthy();
    expect(screen.getByText("Consumer")).toBeTruthy();
    expect(screen.getByText(/The producer never calls the consumer directly/)).toBeTruthy();
    expect(screen.getByText("Viewed 7 / 24")).toBeTruthy();
  });

  it("draws eight hidden thumbs: six viewed, one current, one idle", () => {
    const { container } = render(<DecksPanel />);
    const thumbs = Array.from(container.querySelectorAll<HTMLElement>("[data-thumb]"));
    expect(thumbs.map((thumb) => thumb.dataset.thumb)).toEqual([
      "viewed",
      "viewed",
      "viewed",
      "viewed",
      "viewed",
      "viewed",
      "current",
      "idle",
    ]);
    expect(thumbs[0].closest('[aria-hidden="true"]')).toBeTruthy();
  });

  it("takes focus only on the Join live link", () => {
    const { container } = render(<DecksPanel />);
    const elements = focusableIn(container);
    expect(elements).toHaveLength(1);
    expect(elements[0]).toBe(screen.getByRole("link", { name: /Join live/ }));
    expect(elements[0].getAttribute("href")).toBe("/login");
    expect(elements[0].hasAttribute("tabindex")).toBe(false);
  });
});

describe("OpsPanel", () => {
  it("is a section named by a hidden h2, with Ops inventory as an h3", () => {
    render(<OpsPanel />);
    const heading = screen.getByRole("heading", { level: 2, name: "Ops" });
    expect(heading.id).toBe("ops-title");
    expect(heading.className).toBe("visually-hidden");
    expect(heading.closest("section")?.id).toBe("ops");
    expect(screen.getAllByRole("heading", { level: 2 })).toHaveLength(1);
    expect(screen.getByRole("heading", { level: 3, name: "Ops inventory" })).toBeTruthy();
    expect(screen.getByText("Sample data")).toBeTruthy();
  });

  it("shows the two-tone line as a paragraph", () => {
    render(<OpsPanel />);
    const soft = screen.getByText("everything else goes quiet.");
    expect(soft.parentElement?.tagName).toBe("P");
    expect(soft.parentElement?.textContent).toBe("When the deadline hits, everything else goes quiet.");
  });

  it("shows five items, each with a status chip", () => {
    const { container } = render(<OpsPanel />);
    const chips = Array.from(container.querySelectorAll<HTMLElement>("[data-status]"));
    expect(chips.map((chip) => chip.dataset.status)).toEqual(["due", "late", "graded", "submitted", "submitted"]);
    expect(chips.map((chip) => chip.textContent)).toEqual([
      "Due Fri 23:59",
      "Late · 2 days",
      "Graded 9 / 10",
      "Open",
      "Updated today",
    ]);
    const first = chips[0].parentElement?.parentElement as HTMLElement;
    expect(within(first).getByText("Message brokers")).toBeTruthy();
    expect(first.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
  });

  it("takes focus only on the Open ops link", () => {
    const { container } = render(<OpsPanel />);
    const elements = focusableIn(container);
    expect(elements).toHaveLength(1);
    expect(elements[0]).toBe(screen.getByRole("link", { name: /Open ops/ }));
    expect(elements[0].getAttribute("href")).toBe("/login");
    expect(screen.getByText("Filters").tagName).toBe("SPAN");
  });
});
