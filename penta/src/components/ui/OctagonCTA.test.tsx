import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { OctagonCTA, type OctagonSize } from "./OctagonCTA";

afterEach(cleanup);

const drawings: [OctagonSize, string, string, string][] = [
  [124, "1.2", "30", "1.6"],
  [96, "1.3", "26", "1.7"],
  [72, "1.6", "22", "1.8"],
];

describe("OctagonCTA", () => {
  it("renders one link named by the eyebrow and the title", () => {
    render(<OctagonCTA href="#routes" eyebrow="Enter routes" title="6 classes" />);
    const links = screen.getAllByRole("link");
    expect(links).toHaveLength(1);
    expect(screen.getByRole("link", { name: "Enter routes 6 classes" }).getAttribute("href")).toBe("#routes");
  });

  it("hides both drawings from assistive technology", () => {
    const { container } = render(<OctagonCTA href="#routes" eyebrow="Enter routes" title="6 classes" />);
    const drawn = container.querySelectorAll("svg");
    expect(drawn).toHaveLength(2);
    drawn.forEach((svg) => expect(svg.getAttribute("aria-hidden")).toBe("true"));
  });

  it("defaults to the 124 px drawing", () => {
    const { container } = render(<OctagonCTA href="#routes" eyebrow="Enter routes" title="6 classes" />);
    expect(container.querySelector("svg")?.getAttribute("width")).toBe("124");
  });

  it.each(drawings)("draws the %i px octagon with its own strokes", (size, outline, arrow, arrowStroke) => {
    const { container } = render(<OctagonCTA href="#ops" eyebrow="Open ops" title="3 due" size={size} />);
    const [octagon, pointer] = Array.from(container.querySelectorAll("svg"));
    expect(octagon.getAttribute("width")).toBe(String(size));
    expect(octagon.getAttribute("height")).toBe(String(size));
    expect(octagon.querySelector("polygon")?.getAttribute("stroke-width")).toBe(outline);
    expect(pointer.getAttribute("width")).toBe(arrow);
    expect(pointer.querySelector("path")?.getAttribute("stroke-width")).toBe(arrowStroke);
  });

  it("keeps the octagon fill out of the markup so it can transition", () => {
    const { container } = render(<OctagonCTA href="#routes" eyebrow="Enter routes" title="6 classes" />);
    expect(container.querySelector("polygon")?.hasAttribute("fill")).toBe(false);
  });
});
