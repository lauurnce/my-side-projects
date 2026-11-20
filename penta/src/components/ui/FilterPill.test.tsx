import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { FilterPill } from "./FilterPill";

afterEach(cleanup);

describe("FilterPill", () => {
  it("renders a button named by its text", () => {
    render(<FilterPill>Filters</FilterPill>);
    expect(screen.getByRole("button", { name: "Filters" }).getAttribute("type")).toBe("button");
  });

  it("calls onClick when clicked", () => {
    const onClick = vi.fn();
    render(<FilterPill onClick={onClick}>Filters</FilterPill>);
    fireEvent.click(screen.getByRole("button", { name: "Filters" }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("does not call onClick while disabled", () => {
    const onClick = vi.fn();
    render(
      <FilterPill onClick={onClick} disabled>
        Filters
      </FilterPill>,
    );
    const button = screen.getByRole("button", { name: "Filters" }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    fireEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("passes button props through and keeps its own class", () => {
    render(
      <FilterPill className="extra" aria-pressed="true" aria-label="Filter routes">
        Filters
      </FilterPill>,
    );
    const button = screen.getByRole("button", { name: "Filter routes", pressed: true });
    expect(button.classList.contains("extra")).toBe(true);
    expect(button.classList.length).toBe(2);
  });
});
