import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { IndexPill } from "./IndexPill";

afterEach(cleanup);

const decks = {
  index: "02",
  name: "Decks",
  sub: "Presentations",
  description: "Teachers upload PPTX or PDF. Students flip through, download, or follow a live session slide by slide.",
};

describe("IndexPill", () => {
  it("renders an idle pill button named by the index, the name and the sub label", () => {
    render(<IndexPill {...decks} active={false} onSelect={() => {}} />);
    const button = screen.getByRole("button", { name: "02 Decks Presentations" });
    expect(button.getAttribute("type")).toBe("button");
    expect(button.hasAttribute("aria-current")).toBe(false);
  });

  it("leaves the sub label out when there is none", () => {
    render(<IndexPill index="01" name="Routes" description={decks.description} active={false} onSelect={() => {}} />);
    expect(screen.getByRole("button", { name: "01 Routes" })).toBeTruthy();
  });

  it("never uses the disclosure attributes", () => {
    render(
      <>
        <IndexPill {...decks} active={false} onSelect={() => {}} />
        <IndexPill index="03" name="Ops" description="Quizzes that grade themselves." active onSelect={() => {}} />
      </>,
    );
    screen.getAllByRole("button").forEach((button) => {
      expect(button.hasAttribute("aria-expanded")).toBe(false);
      expect(button.hasAttribute("aria-controls")).toBe(false);
    });
  });

  it("keeps the description in the accessibility tree while idle and shows a plus mark", () => {
    const { container } = render(<IndexPill {...decks} active={false} onSelect={() => {}} />);
    const description = screen.getByText(decks.description);
    expect(description.hasAttribute("aria-hidden")).toBe(false);
    expect(description.hasAttribute("hidden")).toBe(false);
    expect(screen.getByRole("button", { description: decks.description })).toBeTruthy();
    expect(container.querySelector("[aria-hidden='true']")?.textContent).toBe("+");
  });

  it("marks the active button as current and shows a minus mark", () => {
    const { container } = render(<IndexPill {...decks} active onSelect={() => {}} />);
    const button = screen.getByRole("button", { name: "02 Decks Presentations" });
    expect(button.getAttribute("aria-current")).toBe("true");
    expect(screen.getByText(decks.description).hasAttribute("aria-hidden")).toBe(false);
    expect(container.querySelector("[aria-hidden='true']")?.textContent).toBe("−");
  });

  it("points aria-describedby at the description, which sits outside the button", () => {
    render(<IndexPill {...decks} active onSelect={() => {}} />);
    const button = screen.getByRole("button");
    const description = screen.getByText(decks.description);
    expect(description.tagName).toBe("P");
    expect(description.id).not.toBe("");
    expect(button.getAttribute("aria-describedby")).toBe(description.id);
    expect(button.contains(description)).toBe(false);
  });

  it("gives each pill its own description id", () => {
    render(
      <>
        <IndexPill {...decks} active={false} onSelect={() => {}} />
        <IndexPill index="03" name="Ops" description="Quizzes that grade themselves." active onSelect={() => {}} />
      </>,
    );
    const [first, second] = screen.getAllByRole("button");
    expect(first.getAttribute("aria-describedby")).not.toBe(second.getAttribute("aria-describedby"));
  });

  it("calls onSelect when clicked", () => {
    const onSelect = vi.fn();
    render(<IndexPill {...decks} active={false} onSelect={onSelect} />);
    fireEvent.click(screen.getByRole("button"));
    expect(onSelect).toHaveBeenCalledTimes(1);
  });
});
