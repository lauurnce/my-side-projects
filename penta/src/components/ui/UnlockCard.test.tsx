import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { UnlockCard, type UnlockCardProps } from "./UnlockCard";

afterEach(cleanup);

const quiz: UnlockCardProps = { title: "Quiz 06 · Message brokers", viewed: 7, total: 24 };

function renderCard(overrides: Partial<UnlockCardProps> = {}) {
  const { container } = render(<UnlockCard {...quiz} {...overrides} />);
  return {
    text: container.textContent,
    fill: container.querySelector<HTMLElement>("[data-fill]")?.style.width,
    container,
  };
}

describe("UnlockCard", () => {
  it("shows what unlocks and how far the student is", () => {
    const { fill } = renderCard();
    expect(screen.getByText("Finish this deck to unlock")).toBeTruthy();
    expect(screen.getByText("Quiz 06 · Message brokers")).toBeTruthy();
    expect(screen.getByText("Viewed 7 / 24")).toBeTruthy();
    expect(screen.queryByText("Unlocked")).toBeNull();
    expect(fill).toBe("29%");
  });

  it("says unlocked once every slide was seen", () => {
    const { fill } = renderCard({ viewed: 24 });
    expect(screen.getByText("Unlocked")).toBeTruthy();
    expect(screen.getByText("Viewed 24 / 24. Every slide seen.")).toBeTruthy();
    expect(screen.queryByText("Finish this deck to unlock")).toBeNull();
    expect(fill).toBe("100%");
  });

  it("stays locked one slide short", () => {
    renderCard({ viewed: 23 });
    expect(screen.getByText("Finish this deck to unlock")).toBeTruthy();
    expect(screen.getByText("Viewed 23 / 24")).toBeTruthy();
  });

  it("clamps a count above the total", () => {
    const { fill } = renderCard({ viewed: 99 });
    expect(screen.getByText("Viewed 24 / 24. Every slide seen.")).toBeTruthy();
    expect(fill).toBe("100%");
  });

  it("clamps a count below zero", () => {
    const { fill } = renderCard({ viewed: -4 });
    expect(screen.getByText("Viewed 0 / 24")).toBeTruthy();
    expect(fill).toBe("0%");
  });

  it("never unlocks a deck with no slides", () => {
    const { fill } = renderCard({ viewed: 3, total: 0 });
    expect(screen.getByText("Finish this deck to unlock")).toBeTruthy();
    expect(screen.getByText("Viewed 0 / 0")).toBeTruthy();
    expect(fill).toBe("0%");
  });

  it("hides the track from assistive technology and keeps the count as text", () => {
    const { container } = renderCard();
    const track = container.querySelector("[aria-hidden='true']");
    expect(track?.querySelector("[data-fill]")).toBeTruthy();
    expect(track?.textContent).toBe("");
    expect(container.querySelector("[role='progressbar']")).toBeNull();
  });

  it("is one link to the deck when it has an href", () => {
    renderCard({ href: "/decks/d1" });
    const link = screen.getByRole("link", { name: /Quiz 06 · Message brokers/ });
    expect(link.getAttribute("href")).toBe("/decks/d1");
    expect(link.textContent).toContain("Viewed 7 / 24");
    expect(screen.getAllByRole("link")).toHaveLength(1);
  });

  it("is a plain block without an href", () => {
    const { container } = renderCard();
    expect(screen.queryByRole("link")).toBeNull();
    expect(container.querySelector("a")).toBeNull();
    expect(container.firstElementChild?.tagName).toBe("DIV");
  });

  it("renders a title with markup as text and keeps a long title whole", () => {
    const longTitle = "W".repeat(120);
    const { container } = renderCard({ title: "<img src=x onerror=alert(1)>" });
    expect(container.querySelector("img")).toBeNull();
    expect(screen.getByText("<img src=x onerror=alert(1)>")).toBeTruthy();
    cleanup();
    renderCard({ title: longTitle });
    expect(screen.getByText(longTitle)).toBeTruthy();
  });
});
