import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { stackContent } from "@/content/landing";
import { LayerCounter } from "./LayerCounter";
import { ScrollStage } from "./ScrollStage";
import { StackPills } from "./StackPills";

const stackHeight = 2600;
const stageHeight = 900;
const stackTopOnPage = 1000;
const travel = stackHeight - stageHeight;

function stubLayout(scrollY: number) {
  vi.stubGlobal("scrollY", scrollY);
  vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockImplementation(function (this: HTMLElement) {
    if (this.dataset.landing === "stack") return stackHeight;
    return this.dataset.landing === "stage" ? stageHeight : 0;
  });
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
    const top = this.dataset.landing === "stack" ? stackTopOnPage - scrollY : 0;
    return new DOMRect(0, top, 0, 0);
  });
}

function renderStackAt(progress: number) {
  stubLayout(stackTopOnPage + progress * travel);
  return render(
    <ScrollStage>
      <div data-landing="stack">
        <div data-landing="stage">
          <StackPills />
          <LayerCounter />
        </div>
      </div>
    </ScrollStage>,
  );
}

function currentButtons() {
  return screen.getAllByRole("button").filter((button) => button.getAttribute("aria-current") === "true");
}

beforeEach(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
  vi.stubGlobal("matchMedia", () => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
  vi.stubGlobal("scrollTo", vi.fn());
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("StackPills", () => {
  it("renders one button per layer with its sentence as the description", () => {
    renderStackAt(0.5);
    const buttons = screen.getAllByRole("button");
    expect(buttons).toHaveLength(3);
    stackContent.layers.forEach((layer, index) => {
      expect(buttons[index].textContent).toContain(layer.name);
      const description = document.getElementById(buttons[index].getAttribute("aria-describedby") ?? "");
      expect(description?.textContent).toBe(layer.description);
    });
  });

  it.each([
    [0.1, "Routes"],
    [0.5, "Decks"],
    [0.9, "Ops"],
  ])("marks the layer at progress %s as current", (progress, name) => {
    renderStackAt(progress);
    const current = currentButtons();
    expect(current).toHaveLength(1);
    expect(current[0].textContent).toContain(name);
  });

  it("scrolls to the midpoint of a layer when its pill is clicked", () => {
    renderStackAt(0.9);
    fireEvent.click(screen.getByRole("button", { name: /Routes/ }));
    expect(window.scrollTo).toHaveBeenCalledTimes(1);
    const [{ top, behavior }] = vi.mocked(window.scrollTo).mock.calls[0] as unknown as [ScrollToOptions];
    expect(top).toBeCloseTo(stackTopOnPage + 0.22 * travel);
    expect(behavior).toBe("smooth");
  });
});

describe("LayerCounter", () => {
  it.each([
    [0.1, "01", "/ 03 · Routes", 1],
    [0.5, "02", "/ 03 · Decks", 2],
    [0.9, "03", "/ 03 · Ops", 3],
  ])("shows the layer at progress %s", (progress, number, line, reached) => {
    const { container } = renderStackAt(progress);
    const counter = container.querySelector<HTMLElement>("[aria-hidden='true']:has(> div)");
    expect(counter?.textContent).toContain(`[ Layer ]${number}${line}`);
    const ticks = Array.from(counter?.querySelectorAll(":scope > div > span") ?? []);
    expect(ticks).toHaveLength(3);
    expect(ticks.filter((tick) => tick.className.includes("reached"))).toHaveLength(reached);
  });
});
