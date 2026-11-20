import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { DeckThumb } from "./DeckThumb";

afterEach(cleanup);

const deck = {
  href: "/decks/message-based-integration",
  eyebrow: "INTE 301 · Lesson 06",
  title: "Message-based integration",
  slideCount: 24,
  format: "PPTX" as const,
  viewedCount: 7,
};

describe("DeckThumb", () => {
  it("is one link with the title in its name", () => {
    render(<DeckThumb {...deck} />);
    const links = screen.getAllByRole("link");
    expect(links).toHaveLength(1);
    expect(links[0].getAttribute("href")).toBe(deck.href);
    expect(screen.getByRole("link", { name: /Message-based integration/ })).toBe(links[0]);
  });

  it("shows the eyebrow, slide count, format and viewed count", () => {
    render(<DeckThumb {...deck} />);
    expect(screen.getByText("INTE 301 · Lesson 06")).toBeTruthy();
    expect(screen.getByText("24 slides · PPTX")).toBeTruthy();
    expect(screen.getByText("Viewed 7 / 24")).toBeTruthy();
  });

  it("shows the PDF format", () => {
    render(<DeckThumb {...deck} format="PDF" />);
    expect(screen.getByText("24 slides · PDF")).toBeTruthy();
  });

  it("shows the LIVE chip only when live", () => {
    const { rerender } = render(<DeckThumb {...deck} />);
    expect(screen.queryByText("LIVE")).toBeNull();
    rerender(<DeckThumb {...deck} live />);
    expect(screen.getByText("LIVE")).toBeTruthy();
    expect(screen.getByRole("link", { name: /LIVE/ })).toBeTruthy();
  });

  it("renders a static box with no link when there is no href", () => {
    const { container } = render(<DeckThumb {...deck} href={undefined} live />);
    expect(screen.queryByRole("link")).toBeNull();
    expect(container.querySelector("a, button, [tabindex]")).toBeNull();
    expect(container.firstElementChild?.tagName).toBe("DIV");
    expect(screen.getByText("Message-based integration")).toBeTruthy();
    expect(screen.getByText("LIVE")).toBeTruthy();
  });
});
