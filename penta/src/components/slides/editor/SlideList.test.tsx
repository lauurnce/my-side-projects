import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { slideLimits } from "@/lib/config";
import type { EditorAction } from "@/lib/slides/editor";
import { layoutLabels } from "@/lib/slides/layouts";
import { parseDeckContent, type DeckContent, type Slide } from "@/lib/slides/schema";
import { SlideList } from "./SlideList";

const idPattern = /^[a-z0-9]{8}$/;

function slideAt(position: number): Slide {
  const tag = String(position).padStart(3, "0");
  return {
    id: `slide${tag}`,
    blocks: [{ id: `title${tag}`, type: "title", x: 120, y: 120, w: 1360, h: 200, text: `Topic ${position}`, tone: "ink" }],
  };
}

function deckOf(count: number): DeckContent {
  return { v: 1, slides: Array.from({ length: count }, (_, index) => slideAt(index + 1)) };
}

function show(count: number, selectedSlide = 0) {
  const dispatch = vi.fn<(action: EditorAction) => void>();
  const content = deckOf(count);
  render(<SlideList content={content} selectedSlide={selectedSlide} imageBase="/decks/deck-1/images/" dispatch={dispatch} />);
  return { dispatch, content };
}

function button(name: string) {
  return screen.getByRole<HTMLButtonElement>("button", { name });
}

function lastAction(dispatch: ReturnType<typeof show>["dispatch"]) {
  expect(dispatch).toHaveBeenCalledTimes(1);
  return dispatch.mock.calls[0][0];
}

afterEach(cleanup);

describe("SlideList", () => {
  it("shows one item per slide, in order, and marks the selected one", () => {
    show(3, 1);
    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(3);
    expect(items.map((item) => within(item).getByText(/^Topic/).textContent)).toEqual(["Topic 1", "Topic 2", "Topic 3"]);
    const thumbs = items.map((item) => within(item).getAllByRole("button")[0]);
    expect(thumbs.map((thumb) => thumb.getAttribute("aria-current"))).toEqual([null, "true", null]);
    expect(thumbs.map((thumb) => thumb.textContent)).toEqual(["Slide 01Topic 1", "Slide 02Topic 2", "Slide 03Topic 3"]);
  });

  it("selects a slide from its thumbnail", () => {
    const { dispatch } = show(3);
    fireEvent.click(within(screen.getAllByRole("listitem")[2]).getAllByRole("button")[0]);
    expect(lastAction(dispatch)).toEqual({ type: "selectSlide", index: 2 });
  });

  it("moves a slide up", () => {
    const { dispatch } = show(3);
    fireEvent.click(button("Move slide 2 up"));
    expect(lastAction(dispatch)).toEqual({ type: "moveSlide", from: 1, to: 0 });
  });

  it("moves a slide down", () => {
    const { dispatch } = show(3);
    fireEvent.click(button("Move slide 2 down"));
    expect(lastAction(dispatch)).toEqual({ type: "moveSlide", from: 1, to: 2 });
  });

  it("turns off moving at the two ends", () => {
    const { dispatch } = show(3);
    expect(button("Move slide 1 up").disabled).toBe(true);
    expect(button("Move slide 1 down").disabled).toBe(false);
    expect(button("Move slide 3 up").disabled).toBe(false);
    expect(button("Move slide 3 down").disabled).toBe(true);
    fireEvent.click(button("Move slide 1 up"));
    fireEvent.click(button("Move slide 3 down"));
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("duplicates a slide right after it with new ids", () => {
    const { dispatch, content } = show(3);
    fireEvent.click(button("Duplicate slide 2"));
    const action = lastAction(dispatch);
    if (action.type !== "addSlide") throw new Error("expected addSlide");
    expect(action.at).toBe(2);
    const source = content.slides[1];
    expect(action.slide.id).toMatch(idPattern);
    expect(action.slide.id).not.toBe(source.id);
    expect(action.slide.blocks).toHaveLength(1);
    expect(action.slide.blocks[0].id).toMatch(idPattern);
    expect(action.slide.blocks[0].id).not.toBe(source.blocks[0].id);
    expect(action.slide.blocks[0]).toEqual({ ...source.blocks[0], id: action.slide.blocks[0].id });
  });

  it("deletes a slide", () => {
    const { dispatch } = show(3);
    fireEvent.click(button("Delete slide 3"));
    expect(lastAction(dispatch)).toEqual({ type: "deleteSlide", index: 2 });
  });

  it("does not let the last slide be deleted", () => {
    const { dispatch } = show(1);
    expect(button("Delete slide 1").disabled).toBe(true);
    fireEvent.click(button("Delete slide 1"));
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("offers the four layouts under a visible label", () => {
    show(1);
    const select = screen.getByLabelText<HTMLSelectElement>("Layout");
    expect(Array.from(select.options, (option) => option.textContent)).toEqual(Object.values(layoutLabels));
  });

  it("adds a slide with the chosen layout after the selected slide", () => {
    const { dispatch } = show(3, 1);
    fireEvent.change(screen.getByLabelText("Layout"), { target: { value: "threeBoxes" } });
    fireEvent.click(button("Add slide"));
    const action = lastAction(dispatch);
    if (action.type !== "addSlide") throw new Error("expected addSlide");
    expect(action.at).toBe(2);
    expect(action.slide.id).toMatch(idPattern);
    expect(action.slide.blocks.filter((block) => block.type === "box")).toHaveLength(3);
    expect(action.slide.blocks.filter((block) => block.type === "arrow")).toHaveLength(2);
    expect(parseDeckContent({ v: 1, slides: [action.slide] })).not.toBeNull();
  });

  it("adds a different layout when another one is chosen", () => {
    const { dispatch } = show(1);
    fireEvent.change(screen.getByLabelText("Layout"), { target: { value: "twoColumns" } });
    fireEvent.click(button("Add slide"));
    const action = lastAction(dispatch);
    if (action.type !== "addSlide") throw new Error("expected addSlide");
    expect(action.at).toBe(1);
    expect(action.slide.blocks.map((block) => block.type)).toEqual(["title", "text", "text"]);
  });

  it("turns off add and duplicate at the slide limit", () => {
    const { dispatch } = show(slideLimits.slidesMax);
    expect(button("Add slide").disabled).toBe(true);
    expect(button("Duplicate slide 1").disabled).toBe(true);
    expect(button(`Duplicate slide ${slideLimits.slidesMax}`).disabled).toBe(true);
    fireEvent.click(button("Add slide"));
    fireEvent.click(button("Duplicate slide 1"));
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("keeps add and duplicate on one slide below the limit", () => {
    show(slideLimits.slidesMax - 1);
    expect(button("Add slide").disabled).toBe(false);
    expect(button("Duplicate slide 1").disabled).toBe(false);
  });
});
