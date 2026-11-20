import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { Hero } from "./Hero";

afterEach(cleanup);

describe("Hero", () => {
  it("renders the only h1 with the headline", () => {
    render(<Hero />);
    const headings = screen.getAllByRole("heading", { level: 1 });
    expect(headings).toHaveLength(1);
    expect(headings[0].textContent).toBe("Learn at Penta™");
  });

  it("keeps the scroll contract on the section", () => {
    const { container } = render(<Hero />);
    expect(container.querySelectorAll('section[data-landing="hero"]')).toHaveLength(1);
  });

  it("links the octagon to the login page", () => {
    render(<Hero />);
    expect(screen.getByRole("link", { name: "Enter the stack Start climb" }).getAttribute("href")).toBe("/login");
  });

  it("focuses only the octagon and the scroll link", () => {
    const { container } = render(<Hero />);
    const hrefs = Array.from(container.querySelectorAll("a, button, [tabindex]")).map((node) => node.getAttribute("href"));
    expect(hrefs).toEqual(["/login", "#stack"]);
  });

  it("hides the preview cards and the counter from assistive technology", () => {
    render(<Hero />);
    expect(screen.queryByText("Slide 07 / 24")?.closest('[aria-hidden="true"]')).toBeTruthy();
    expect(screen.queryByText("Quiz 06 · Q 04 / 20")?.closest('[aria-hidden="true"]')).toBeTruthy();
  });

  it("paints the building as a background, not an image", () => {
    const { container } = render(<Hero />);
    expect(container.querySelectorAll("img")).toHaveLength(0);
    expect(container.querySelectorAll(".building-image")).toHaveLength(1);
  });
});
