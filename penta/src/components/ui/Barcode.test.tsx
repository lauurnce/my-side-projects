import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { Barcode } from "./Barcode";

afterEach(cleanup);

const widths = [2, 1, 3, 1, 1, 4, 2, 1, 2, 3, 1, 1, 2, 4, 1, 2, 1, 3, 2, 1, 1, 2, 3, 1];

describe("Barcode", () => {
  it("renders 24 bars inside a hidden box with the reference widths", () => {
    const { container } = render(<Barcode />);
    const box = container.querySelector('[aria-hidden="true"]') as HTMLElement;
    const bars = Array.from(box.children) as HTMLElement[];
    expect(bars).toHaveLength(24);
    expect(bars.map((bar) => bar.style.width)).toEqual(widths.map((width) => `${width}px`));
  });

  it("renders the caption outside the hidden box", () => {
    render(<Barcode caption="PUP · INTE 301" />);
    const caption = screen.getByText("PUP · INTE 301");
    expect(caption.closest('[aria-hidden="true"]')).toBeNull();
  });

  it("renders no caption element without a caption", () => {
    const { container } = render(<Barcode />);
    expect(container.firstElementChild?.childElementCount).toBe(1);
  });
});
