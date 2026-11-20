import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { AltitudeMeter } from "./AltitudeMeter";

afterEach(cleanup);

function markerTop(meters: number) {
  const { container } = render(<AltitudeMeter meters={meters} />);
  const top = container.querySelector<HTMLElement>("[data-marker]")?.style.top;
  cleanup();
  return top;
}

describe("AltitudeMeter", () => {
  it("shows the label and the number with a thousands comma", () => {
    render(<AltitudeMeter meters={1840} />);
    expect(screen.getByText("Your altitude")).toBeTruthy();
    expect(screen.getByText(/1,840 m/).textContent).toBe("1,840 m of 3,000 meters");
    expect(screen.getByText("of 3,000 meters").className).toBe("visually-hidden");
  });

  it("hides the scale and the marker from assistive technology", () => {
    const { container } = render(<AltitudeMeter meters={1840} />);
    const scale = screen.getByText("2,000").parentElement;
    expect(scale?.getAttribute("aria-hidden")).toBe("true");
    expect(scale?.textContent).toBe("3,0002,0001,0000 m");
    expect(scale?.contains(container.querySelector("[data-marker]"))).toBe(true);
  });

  it("shows the note only when one is given", () => {
    const note = "Lessons, decks and activities each add meters. Summit = 3,000 m per term.";
    const { container, rerender } = render(<AltitudeMeter meters={1840} />);
    expect(container.textContent).not.toContain("Summit");
    rerender(<AltitudeMeter meters={1840} note={note} />);
    expect(screen.getByText(note)).toBeTruthy();
  });

  it("places the marker by altitude", () => {
    expect(markerTop(0)).toBe("100%");
    expect(markerTop(1840)).toBe("38.7%");
    expect(markerTop(1500)).toBe("50%");
    expect(markerTop(3000)).toBe("0%");
  });

  it("clamps the marker for out of range values", () => {
    expect(markerTop(-200)).toBe("100%");
    expect(markerTop(4200)).toBe("0%");
    expect(markerTop(Number.NaN)).toBe("100%");
  });
});
