import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { Grain } from "./Grain";

afterEach(cleanup);

describe("Grain", () => {
  it("renders one empty div hidden from assistive technology", () => {
    const { container } = render(<Grain />);
    const grain = container.firstElementChild as HTMLElement;
    expect(container.childElementCount).toBe(1);
    expect(grain.tagName).toBe("DIV");
    expect(grain.getAttribute("aria-hidden")).toBe("true");
    expect(grain.textContent).toBe("");
    expect(grain.className).not.toBe("");
  });
});
