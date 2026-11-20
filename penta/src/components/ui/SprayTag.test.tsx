import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { SprayTag } from "./SprayTag";

afterEach(cleanup);

describe("SprayTag", () => {
  it("renders the tag hidden from assistive technology", () => {
    render(<SprayTag>Penta</SprayTag>);
    expect(screen.getByText("Penta").getAttribute("aria-hidden")).toBe("true");
  });

  it("keeps its own class and adds the class of the caller", () => {
    render(<SprayTag className="hero-tag">Penta</SprayTag>);
    const tag = screen.getByText("Penta");
    expect(tag.classList.contains("hero-tag")).toBe(true);
    expect(tag.classList.length).toBe(2);
  });

  it("has only its own class without a className", () => {
    render(<SprayTag>Penta</SprayTag>);
    expect(screen.getByText("Penta").classList.length).toBe(1);
  });
});
