import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { BracketLabel } from "./BracketLabel";

afterEach(cleanup);

describe("BracketLabel", () => {
  it("wraps the text in brackets with a space inside each", () => {
    const { container } = render(<BracketLabel>Layer 01</BracketLabel>);
    expect(container.textContent).toBe("[ Layer 01 ]");
    expect(screen.getByText("Layer 01")).toBeTruthy();
  });

  it("hides both brackets from assistive technology", () => {
    const { container } = render(<BracketLabel>Layer 01</BracketLabel>);
    const hidden = Array.from(container.querySelectorAll('[aria-hidden="true"]'));
    expect(hidden.map((bracket) => bracket.textContent)).toEqual(["[ ", " ]"]);
  });
});
