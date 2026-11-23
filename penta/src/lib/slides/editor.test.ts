import { describe, expect, it } from "vitest";
import { slideLimits } from "@/lib/config";
import { canRedo, canUndo, createEditorState, editorReducer } from "./editor";
import type { EditorAction, EditorState } from "./editor";
import { parseDeckContent } from "./schema";
import type { Block, DeckContent, Fill, Frame, Slide } from "./schema";

const frame: Frame = { x: 100, y: 100, w: 400, h: 200 };

function deepFreeze<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value;
  Object.freeze(value);
  Object.values(value).forEach(deepFreeze);
  return value;
}

function title(id: string, text = "Heading"): Block {
  return { id, type: "title", ...frame, text, tone: "ink" };
}

function paragraph(id: string, text = "Body"): Block {
  return { id, type: "text", ...frame, text, tone: "ink" };
}

function box(id: string, fill: Fill = "none"): Block {
  return { id, type: "box", ...frame, text: "Label", fill };
}

function arrow(id: string): Block {
  return { id, type: "arrow", ...frame, direction: "right" };
}

function image(id: string): Block {
  return { id, type: "image", ...frame, file: "0a1b2c3d-0a1b-4c2d-8e3f-0a1b2c3d4e5f.png", alt: "A chart" };
}

function slide(id: string, blocks: Block[] = []): Slide {
  return { id, blocks };
}

function deck(slides: Slide[]): DeckContent {
  return { v: 1, slides };
}

function numberedId(prefix: string, count: number): string {
  return prefix + String(count).padStart(8 - prefix.length, "0");
}

function twoSlideDeck(): DeckContent {
  return deck([
    slide("slide00a", [title("title00a"), paragraph("text000a"), box("box0000a")]),
    slide("slide00b", [title("title00b"), arrow("arrow00b"), image("image00b")]),
  ]);
}

function run(state: EditorState, ...actions: EditorAction[]): EditorState {
  return actions.reduce((current, action) => editorReducer(deepFreeze(current), deepFreeze(action)), state);
}

function start(content: DeckContent = twoSlideDeck()): EditorState {
  return deepFreeze(createEditorState(content));
}

function blockOf(state: EditorState, slideIndex: number, blockId: string): Block {
  const found = state.content.slides[slideIndex].blocks.find((block) => block.id === blockId);
  if (!found) throw new Error(`missing block ${blockId}`);
  return found;
}

function textOf(state: EditorState, blockId: string): string {
  const found = blockOf(state, state.selectedSlide, blockId);
  return "text" in found ? found.text : "";
}

function slideIds(state: EditorState): string[] {
  return state.content.slides.map((each) => each.id);
}

function expectUnchanged(state: EditorState, action: EditorAction) {
  expect(run(state, action)).toBe(state);
}

describe("slides", () => {
  it("adds a slide at the index and selects it", () => {
    const before = run(start(), { type: "selectBlock", blockId: "title00a" });
    const after = run(before, { type: "addSlide", slide: slide("slide00c"), at: 1 });
    expect(slideIds(after)).toEqual(["slide00a", "slide00c", "slide00b"]);
    expect(after.selectedSlide).toBe(1);
    expect(after.selectedBlock).toBeNull();
    expect(after.past).toEqual([before.content]);
  });

  it("clamps the insert index into the list", () => {
    const atEnd = run(start(), { type: "addSlide", slide: slide("slide00c"), at: 99 });
    expect(slideIds(atEnd)).toEqual(["slide00a", "slide00b", "slide00c"]);
    expect(atEnd.selectedSlide).toBe(2);
    const atStart = run(start(), { type: "addSlide", slide: slide("slide00c"), at: -5 });
    expect(slideIds(atStart)).toEqual(["slide00c", "slide00a", "slide00b"]);
    expect(atStart.selectedSlide).toBe(0);
  });

  it("deletes a slide and selects the one now at that index", () => {
    const three = deck([slide("slide00a"), slide("slide00b"), slide("slide00c")]);
    const after = run(start(three), { type: "deleteSlide", index: 1 });
    expect(slideIds(after)).toEqual(["slide00a", "slide00c"]);
    expect(after.selectedSlide).toBe(1);
  });

  it("selects the last slide after deleting the last one", () => {
    const after = run(start(), { type: "selectSlide", index: 1 }, { type: "selectBlock", blockId: "title00b" }, { type: "deleteSlide", index: 1 });
    expect(slideIds(after)).toEqual(["slide00a"]);
    expect(after.selectedSlide).toBe(0);
    expect(after.selectedBlock).toBeNull();
  });

  it("moves a slide and the selection follows the selected slide", () => {
    const three = deck([slide("slide00a", [title("title00a")]), slide("slide00b"), slide("slide00c")]);
    const selected = run(start(three), { type: "selectBlock", blockId: "title00a" });
    const moved = run(selected, { type: "moveSlide", from: 0, to: 2 });
    expect(slideIds(moved)).toEqual(["slide00b", "slide00c", "slide00a"]);
    expect(moved.selectedSlide).toBe(2);
    expect(moved.selectedBlock).toBe("title00a");
  });

  it("keeps the selection on its slide when another slide moves past it", () => {
    const three = deck([slide("slide00a"), slide("slide00b"), slide("slide00c")]);
    const selected = run(start(three), { type: "selectSlide", index: 1 });
    const moved = run(selected, { type: "moveSlide", from: 2, to: 0 });
    expect(slideIds(moved)).toEqual(["slide00c", "slide00a", "slide00b"]);
    expect(moved.selectedSlide).toBe(2);
  });

  it("selects a slide and clears the block selection without history", () => {
    const before = run(start(), { type: "selectBlock", blockId: "title00a" });
    const after = run(before, { type: "selectSlide", index: 1 });
    expect(after.selectedSlide).toBe(1);
    expect(after.selectedBlock).toBeNull();
    expect(after.past).toBe(before.past);
    expect(after.future).toBe(before.future);
    expect(after.content).toBe(before.content);
  });
});

describe("blocks", () => {
  it("adds a block to the selected slide and selects it", () => {
    const after = run(start(), { type: "selectSlide", index: 1 }, { type: "addBlock", block: box("box0000c") });
    expect(after.content.slides[1].blocks.map((block) => block.id)).toEqual(["title00b", "arrow00b", "image00b", "box0000c"]);
    expect(after.content.slides[0].blocks).toHaveLength(3);
    expect(after.selectedBlock).toBe("box0000c");
    expect(after.past).toHaveLength(1);
  });

  it("selects a block on the selected slide and clears with null", () => {
    const selected = run(start(), { type: "selectBlock", blockId: "text000a" });
    expect(selected.selectedBlock).toBe("text000a");
    expect(selected.past).toHaveLength(0);
    expect(run(selected, { type: "selectBlock", blockId: null }).selectedBlock).toBeNull();
  });

  it("moves and resizes a block with setFrame", () => {
    const selected = run(start(), { type: "selectBlock", blockId: "title00a" });
    const next = { x: 20, y: 40, w: 800, h: 300 };
    const after = run(selected, { type: "setFrame", blockId: "title00a", frame: next, merge: false });
    expect(blockOf(after, 0, "title00a")).toMatchObject(next);
    expect(after.selectedBlock).toBe("title00a");
    expect(after.mergeKey).toBe("setFrame:title00a");
    expect(after.past).toEqual([selected.content]);
  });

  it("clamps a frame into the canvas and to the minimum size", () => {
    const outside = run(start(), { type: "setFrame", blockId: "title00a", frame: { x: 1590.4, y: -30, w: 400, h: 2000 }, merge: false });
    expect(blockOf(outside, 0, "title00a")).toMatchObject({ x: 1200, y: 0, w: 400, h: 900 });
    const tiny = run(start(), { type: "setFrame", blockId: "title00a", frame: { x: 10, y: 10, w: 1, h: -8 }, merge: false });
    expect(blockOf(tiny, 0, "title00a")).toMatchObject({ x: 10, y: 10, w: slideLimits.blockMinSize, h: slideLimits.blockMinSize });
  });

  it("sets text on title, text and box blocks only", () => {
    const after = run(
      start(),
      { type: "setText", blockId: "title00a", text: "New heading", merge: false },
      { type: "setText", blockId: "text000a", text: "Line one\nLine two", merge: false },
      { type: "setText", blockId: "box0000a", text: "New label", merge: false },
    );
    expect(textOf(after, "title00a")).toBe("New heading");
    expect(textOf(after, "text000a")).toBe("Line one\nLine two");
    expect(textOf(after, "box0000a")).toBe("New label");
    const onSecond = run(start(), { type: "selectSlide", index: 1 });
    expectUnchanged(onSecond, { type: "setText", blockId: "arrow00b", text: "Words", merge: false });
    expectUnchanged(onSecond, { type: "setText", blockId: "image00b", text: "Words", merge: false });
  });

  it("applies the style field each block type has", () => {
    const first = run(
      start(),
      { type: "setStyle", blockId: "title00a", style: { tone: "maroon" } },
      { type: "setStyle", blockId: "box0000a", style: { fill: "gold" } },
    );
    expect(blockOf(first, 0, "title00a")).toMatchObject({ tone: "maroon" });
    expect(blockOf(first, 0, "box0000a")).toMatchObject({ fill: "gold" });
    expect(first.mergeKey).toBeNull();
    const second = run(
      start(),
      { type: "selectSlide", index: 1 },
      { type: "setStyle", blockId: "arrow00b", style: { direction: "down" } },
      { type: "setStyle", blockId: "image00b", style: { alt: "Sales by month" } },
    );
    expect(blockOf(second, 1, "arrow00b")).toMatchObject({ direction: "down" });
    expect(blockOf(second, 1, "image00b")).toMatchObject({ alt: "Sales by month" });
    expect(second.past).toHaveLength(2);
  });

  it("ignores style fields the block type does not have", () => {
    const mixed = run(start(), { type: "setStyle", blockId: "title00a", style: { tone: "maroon", fill: "gold", direction: "up", alt: "Nope" } });
    expect(blockOf(mixed, 0, "title00a")).toEqual({ ...title("title00a"), tone: "maroon" });
    expectUnchanged(start(), { type: "setStyle", blockId: "title00a", style: { fill: "gold", direction: "up", alt: "Nope" } });
    expectUnchanged(start(), { type: "setStyle", blockId: "box0000a", style: { tone: "maroon" } });
    expectUnchanged(start(), { type: "setStyle", blockId: "title00a", style: {} });
    expectUnchanged(start(), { type: "setStyle", blockId: "title00a", style: { tone: "ink" } });
  });

  it("deletes a block and clears the selection when it was selected", () => {
    const selected = run(start(), { type: "selectBlock", blockId: "text000a" });
    const after = run(selected, { type: "deleteBlock", blockId: "text000a" });
    expect(after.content.slides[0].blocks.map((block) => block.id)).toEqual(["title00a", "box0000a"]);
    expect(after.selectedBlock).toBeNull();
  });

  it("keeps the selection when another block is deleted", () => {
    const after = run(start(), { type: "selectBlock", blockId: "title00a" }, { type: "deleteBlock", blockId: "text000a" });
    expect(after.selectedBlock).toBe("title00a");
  });
});

describe("history", () => {
  it("undoes and redoes a change", () => {
    const before = start();
    const changed = run(before, { type: "setText", blockId: "title00a", text: "Changed", merge: false });
    expect(canUndo(changed)).toBe(true);
    expect(canRedo(changed)).toBe(false);
    const undone = run(changed, { type: "undo" });
    expect(undone.content).toBe(before.content);
    expect(undone.mergeKey).toBeNull();
    expect(canUndo(undone)).toBe(false);
    expect(canRedo(undone)).toBe(true);
    const redone = run(undone, { type: "redo" });
    expect(redone.content).toBe(changed.content);
    expect(redone.mergeKey).toBeNull();
    expect(canUndo(redone)).toBe(true);
    expect(canRedo(redone)).toBe(false);
  });

  it("returns the same state when there is nothing to undo or redo", () => {
    expectUnchanged(start(), { type: "undo" });
    expectUnchanged(start(), { type: "redo" });
  });

  it("walks back and forward through several steps in order", () => {
    const texts = ["One", "Two", "Three"];
    const changed = run(start(), ...texts.map((text): EditorAction => ({ type: "setText", blockId: "title00a", text, merge: false })));
    const back = run(changed, { type: "undo" }, { type: "undo" });
    expect(textOf(back, "title00a")).toBe("One");
    const forward = run(back, { type: "redo" });
    expect(textOf(forward, "title00a")).toBe("Two");
    expect(textOf(run(forward, { type: "redo" }), "title00a")).toBe("Three");
  });

  it("clears redo when a new change follows an undo", () => {
    const undone = run(start(), { type: "setText", blockId: "title00a", text: "Changed", merge: false }, { type: "undo" });
    const after = run(undone, { type: "setStyle", blockId: "title00a", style: { tone: "maroon" } });
    expect(after.future).toEqual([]);
    expect(canRedo(after)).toBe(false);
    expectUnchanged(after, { type: "redo" });
  });

  it("keeps at most fifty steps and drops the oldest", () => {
    const changes = Array.from({ length: 60 }, (_, index): EditorAction => ({ type: "setText", blockId: "title00a", text: `Change ${index + 1}`, merge: false }));
    const changed = run(start(), ...changes);
    expect(changed.past).toHaveLength(slideLimits.historySteps);
    const undone = run(changed, ...Array.from({ length: 50 }, (): EditorAction => ({ type: "undo" })));
    expect(textOf(undone, "title00a")).toBe("Change 10");
    expect(canUndo(undone)).toBe(false);
    expectUnchanged(undone, { type: "undo" });
    expect(undone.future).toHaveLength(50);
  });

  it("selection changes never touch the history", () => {
    const changed = run(start(), { type: "setText", blockId: "title00a", text: "Changed", merge: false }, { type: "undo" });
    const after = run(changed, { type: "selectBlock", blockId: "text000a" }, { type: "selectSlide", index: 1 });
    expect(after.past).toBe(changed.past);
    expect(after.future).toBe(changed.future);
  });
});

describe("merge", () => {
  it("makes a typing run one undo step", () => {
    const before = start();
    const typing = Array.from({ length: 40 }, (_, index): EditorAction => ({ type: "setText", blockId: "title00a", text: "x".repeat(index + 1), merge: true }));
    const typed = run(before, ...typing);
    expect(textOf(typed, "title00a")).toBe("x".repeat(40));
    expect(typed.past).toHaveLength(1);
    expect(typed.mergeKey).toBe("setText:title00a");
    const undone = run(typed, { type: "undo" });
    expect(undone.content).toBe(before.content);
    expect(canUndo(undone)).toBe(false);
  });

  it("makes a held arrow key one undo step", () => {
    const before = start();
    const nudges = Array.from({ length: 40 }, (_, index): EditorAction => ({ type: "setFrame", blockId: "title00a", frame: { ...frame, x: frame.x + (index + 1) * 8 }, merge: true }));
    const nudged = run(before, ...nudges);
    expect(blockOf(nudged, 0, "title00a").x).toBe(420);
    expect(nudged.past).toHaveLength(1);
    expect(run(nudged, { type: "undo" }).content).toBe(before.content);
  });

  it("starts a new step for a different block", () => {
    const after = run(
      start(),
      { type: "setText", blockId: "title00a", text: "A", merge: true },
      { type: "setText", blockId: "title00a", text: "AB", merge: true },
      { type: "setText", blockId: "text000a", text: "C", merge: true },
    );
    expect(after.past).toHaveLength(2);
    expect(after.mergeKey).toBe("setText:text000a");
    const undone = run(after, { type: "undo" });
    expect(textOf(undone, "title00a")).toBe("AB");
    expect(textOf(undone, "text000a")).toBe("Body");
  });

  it("starts a new step for a different action on the same block", () => {
    const after = run(
      start(),
      { type: "setText", blockId: "title00a", text: "A", merge: true },
      { type: "setFrame", blockId: "title00a", frame: { ...frame, x: 8 }, merge: true },
    );
    expect(after.past).toHaveLength(2);
  });

  it("starts a new step after a selection change", () => {
    const after = run(
      start(),
      { type: "setText", blockId: "title00a", text: "A", merge: true },
      { type: "selectBlock", blockId: "title00a" },
      { type: "setText", blockId: "title00a", text: "AB", merge: true },
    );
    expect(after.past).toHaveLength(2);
    expect(textOf(run(after, { type: "undo" }), "title00a")).toBe("A");
  });

  it("clears the merge key on a selection change", () => {
    const typed = run(start(), { type: "setText", blockId: "title00a", text: "A", merge: true });
    expect(run(typed, { type: "selectBlock", blockId: "title00a" }).mergeKey).toBeNull();
    expect(run(typed, { type: "selectSlide", index: 1 }).mergeKey).toBeNull();
    expect(run(typed, { type: "selectBlock", blockId: null }).mergeKey).toBeNull();
  });

  it("starts a new step after undo, redo and another kind of change", () => {
    const typed = run(start(), { type: "setText", blockId: "title00a", text: "A", merge: true });
    const more: EditorAction = { type: "setText", blockId: "title00a", text: "AB", merge: true };
    expect(run(typed, { type: "undo" }, { type: "redo" }, more).past).toHaveLength(2);
    expect(run(typed, { type: "setStyle", blockId: "title00a", style: { tone: "maroon" } }, more).past).toHaveLength(3);
  });

  it("adds a step when merge is false even on the same block", () => {
    const after = run(
      start(),
      { type: "setText", blockId: "title00a", text: "A", merge: false },
      { type: "setText", blockId: "title00a", text: "AB", merge: false },
      { type: "setText", blockId: "title00a", text: "ABC", merge: true },
    );
    expect(after.past).toHaveLength(2);
  });
});

describe("structural sharing", () => {
  it("keeps untouched slides and blocks as the same objects", () => {
    const before = start();
    const after = run(before, { type: "setFrame", blockId: "text000a", frame: { ...frame, x: 0 }, merge: false });
    expect(after.content.slides[1]).toBe(before.content.slides[1]);
    expect(after.content.slides[0]).not.toBe(before.content.slides[0]);
    expect(after.content.slides[0].blocks[0]).toBe(before.content.slides[0].blocks[0]);
    expect(after.content.slides[0].blocks[1]).not.toBe(before.content.slides[0].blocks[1]);
    expect(after.content.slides[0].blocks[2]).toBe(before.content.slides[0].blocks[2]);
  });

  it("keeps every slide object when slides are added, moved or deleted", () => {
    const before = start();
    const added = run(before, { type: "addSlide", slide: slide("slide00c"), at: 0 });
    expect(added.content.slides[1]).toBe(before.content.slides[0]);
    expect(added.content.slides[2]).toBe(before.content.slides[1]);
    const moved = run(before, { type: "moveSlide", from: 0, to: 1 });
    expect(moved.content.slides[0]).toBe(before.content.slides[1]);
    expect(moved.content.slides[1]).toBe(before.content.slides[0]);
    const deleted = run(before, { type: "deleteSlide", index: 0 });
    expect(deleted.content.slides[0]).toBe(before.content.slides[1]);
  });

  it("restores the exact earlier content object on undo", () => {
    const before = start();
    const after = run(before, { type: "deleteBlock", blockId: "box0000a" }, { type: "undo" });
    expect(after.content).toBe(before.content);
    expect(after.content.slides[0]).toBe(before.content.slides[0]);
  });
});

describe("no-ops return the same state", () => {
  it("ignores an equal frame, text or style", () => {
    expectUnchanged(start(), { type: "setFrame", blockId: "title00a", frame: { ...frame }, merge: false });
    expectUnchanged(start(), { type: "setFrame", blockId: "title00a", frame: { ...frame, x: 100.2 }, merge: true });
    expectUnchanged(start(), { type: "setText", blockId: "title00a", text: "Heading", merge: false });
    expectUnchanged(start(), { type: "setStyle", blockId: "box0000a", style: { fill: "none" } });
  });

  it("keeps a typing run open across an equal change", () => {
    const typed = run(start(), { type: "setText", blockId: "title00a", text: "A", merge: true });
    expectUnchanged(typed, { type: "setText", blockId: "title00a", text: "A", merge: true });
  });

  it("ignores an unknown block id", () => {
    expectUnchanged(start(), { type: "selectBlock", blockId: "missing0" });
    expectUnchanged(start(), { type: "setFrame", blockId: "missing0", frame, merge: false });
    expectUnchanged(start(), { type: "setText", blockId: "missing0", text: "Words", merge: false });
    expectUnchanged(start(), { type: "setStyle", blockId: "missing0", style: { tone: "maroon" } });
    expectUnchanged(start(), { type: "deleteBlock", blockId: "missing0" });
  });

  it("ignores a block on another slide", () => {
    expectUnchanged(start(), { type: "selectBlock", blockId: "title00b" });
    expectUnchanged(start(), { type: "setFrame", blockId: "title00b", frame: { ...frame, x: 0 }, merge: false });
    expectUnchanged(start(), { type: "setText", blockId: "title00b", text: "Words", merge: false });
    expectUnchanged(start(), { type: "setStyle", blockId: "arrow00b", style: { direction: "up" } });
    expectUnchanged(start(), { type: "deleteBlock", blockId: "title00b" });
  });

  it("ignores out of range indexes", () => {
    const indexes = [-1, 2, 99, 0.5, Number.NaN];
    indexes.forEach((index) => {
      expectUnchanged(start(), { type: "selectSlide", index });
      expectUnchanged(start(), { type: "deleteSlide", index });
      expectUnchanged(start(), { type: "moveSlide", from: index, to: 0 });
      expectUnchanged(start(), { type: "moveSlide", from: 0, to: index });
    });
    expectUnchanged(start(), { type: "addSlide", slide: slide("slide00c"), at: Number.NaN });
    expectUnchanged(start(), { type: "addSlide", slide: slide("slide00c"), at: 0.5 });
  });

  it("ignores a move to the same place and selecting what is selected", () => {
    expectUnchanged(start(), { type: "moveSlide", from: 1, to: 1 });
    expectUnchanged(start(), { type: "selectSlide", index: 0 });
    expectUnchanged(start(), { type: "selectBlock", blockId: null });
  });

  it("never deletes the only slide", () => {
    expectUnchanged(start(deck([slide("slide00a")])), { type: "deleteSlide", index: 0 });
  });

  it("refuses a second gold box on a slide", () => {
    const golden = start(deck([slide("slide00a", [box("box0000a", "gold"), box("box0000b")]), slide("slide00b")]));
    expectUnchanged(golden, { type: "addBlock", block: box("box0000c", "gold") });
    expectUnchanged(golden, { type: "setStyle", blockId: "box0000b", style: { fill: "gold" } });
    const other = run(golden, { type: "selectSlide", index: 1 }, { type: "addBlock", block: box("box0000c", "gold") });
    expect(other.content.slides[1].blocks).toHaveLength(1);
  });

  it("refuses a 31st block", () => {
    const blocks = Array.from({ length: slideLimits.blocksPerSlide }, (_, index) => arrow(numberedId("ar", index)));
    expectUnchanged(start(deck([slide("slide00a", blocks)])), { type: "addBlock", block: arrow("arrow0zz") });
  });

  it("refuses a 61st slide", () => {
    const slides = Array.from({ length: slideLimits.slidesMax }, (_, index) => slide(numberedId("sl", index)));
    expectUnchanged(start(deck(slides)), { type: "addSlide", slide: slide("slide0zz"), at: 3 });
  });

  it("refuses a duplicate id", () => {
    expectUnchanged(start(), { type: "addBlock", block: box("title00a") });
    expectUnchanged(start(), { type: "addBlock", block: box("title00b") });
    expectUnchanged(start(), { type: "addBlock", block: box("slide00b") });
    expectUnchanged(start(), { type: "addSlide", slide: slide("slide00a"), at: 0 });
    expectUnchanged(start(), { type: "addSlide", slide: slide("slide00c", [arrow("arrow00b")]), at: 0 });
  });

  it("refuses text that breaks the rules", () => {
    expectUnchanged(start(), { type: "setText", blockId: "title00a", text: "One\nTwo", merge: false });
    expectUnchanged(start(), { type: "setText", blockId: "box0000a", text: "One\nTwo", merge: false });
    expectUnchanged(start(), { type: "setText", blockId: "title00a", text: "x".repeat(slideLimits.titleLength + 1), merge: false });
    expectUnchanged(start(), { type: "setText", blockId: "text000a", text: "x".repeat(slideLimits.textLength + 1), merge: false });
    expectUnchanged(start(), { type: "setText", blockId: "text000a", text: "zero​width", merge: false });
    expectUnchanged(start(), { type: "setText", blockId: "text000a", text: "tab\there", merge: true });
  });

  it("refuses a malformed block, slide or frame", () => {
    expectUnchanged(start(), { type: "addBlock", block: { ...box("box0000c"), x: 1500 } });
    expectUnchanged(start(), { type: "addBlock", block: box("BAD") });
    expectUnchanged(start(), { type: "addSlide", slide: slide("BAD"), at: 0 });
    expectUnchanged(start(), { type: "setFrame", blockId: "title00a", frame: { ...frame, x: Number.NaN }, merge: false });
    const selected = run(start(), { type: "selectSlide", index: 1 });
    expectUnchanged(selected, { type: "setStyle", blockId: "image00b", style: { alt: "x".repeat(slideLimits.altLength + 1) } });
    expectUnchanged(selected, { type: "replace", content: { v: 1, slides: [] } });
  });
});

describe("selection repair", () => {
  it("clears the block selection when undo removes the selected block", () => {
    const added = run(start(), { type: "addBlock", block: box("box0000c") });
    expect(added.selectedBlock).toBe("box0000c");
    const undone = run(added, { type: "undo" });
    expect(undone.selectedBlock).toBeNull();
    expect(undone.selectedSlide).toBe(0);
  });

  it("moves to the last slide when undo removes the selected slide", () => {
    const added = run(start(), { type: "addSlide", slide: slide("slide00c", [title("title00c")]), at: 2 }, { type: "addBlock", block: box("box0000c") });
    expect(added.selectedSlide).toBe(2);
    const undone = run(added, { type: "undo" }, { type: "undo" });
    expect(undone.selectedSlide).toBe(1);
    expect(undone.selectedBlock).toBeNull();
  });

  it("clears the block selection when redo removes the selected block", () => {
    const undone = run(start(), { type: "deleteBlock", blockId: "title00a" }, { type: "undo" }, { type: "selectBlock", blockId: "title00a" });
    expect(undone.selectedBlock).toBe("title00a");
    expect(run(undone, { type: "redo" }).selectedBlock).toBeNull();
  });

  it("keeps a selection that still exists after replace and repairs one that does not", () => {
    const selected = run(start(), { type: "selectSlide", index: 1 }, { type: "selectBlock", blockId: "title00b" });
    const same = run(selected, { type: "replace", content: twoSlideDeck() });
    expect(same.selectedSlide).toBe(1);
    expect(same.selectedBlock).toBe("title00b");
    const smaller = run(selected, { type: "replace", content: deck([slide("slide00z", [title("title00z")])]) });
    expect(smaller.selectedSlide).toBe(0);
    expect(smaller.selectedBlock).toBeNull();
  });
});

describe("replace", () => {
  it("empties the history so a saved deck cannot be undone", () => {
    const changed = run(
      start(),
      { type: "setText", blockId: "title00a", text: "Changed", merge: true },
      { type: "setText", blockId: "text000a", text: "Changed", merge: false },
      { type: "undo" },
    );
    const saved = run(changed, { type: "replace", content: changed.content });
    expect(saved.content).toBe(changed.content);
    expect(saved.past).toEqual([]);
    expect(saved.future).toEqual([]);
    expect(saved.mergeKey).toBeNull();
    expect(canUndo(saved)).toBe(false);
    expect(canRedo(saved)).toBe(false);
    expectUnchanged(saved, { type: "undo" });
    expectUnchanged(saved, { type: "redo" });
  });
});

function seededRandom(seed: number): () => number {
  let value = seed;
  return () => {
    value = (value + 0x6d2b79f5) | 0;
    const mixed = Math.imul(value ^ (value >>> 15), value | 1);
    const twice = mixed ^ (mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61));
    return ((twice ^ (twice >>> 14)) >>> 0) / 4294967296;
  };
}

function actionSource(seed: number): (state: EditorState) => EditorAction {
  const random = seededRandom(seed);
  let made = 0;
  const makeId = () => numberedId("g", (made += 1));
  const whole = (low: number, high: number) => low + Math.floor(random() * (high - low + 1));
  const pick = <T,>(items: readonly T[]): T => items[whole(0, items.length - 1)];
  const flip = () => random() < 0.5;
  const someFrame = (): Frame => ({ x: whole(-200, 1800), y: whole(-200, 1100), w: whole(-50, 1800), h: whole(-50, 1100) });
  const someText = () => pick(["Short", "Two\nlines", "", "x".repeat(250), "x".repeat(2100), "tab\there", "Plain words here"]);
  const someIndex = (state: EditorState) => whole(-2, state.content.slides.length + 1);
  const someBlock = (id: string): Block =>
    pick([title(id), paragraph(id), box(id, pick(["none", "ink", "gold", "gold"])), arrow(id), image(id), { ...box(id), x: 1500 }]);
  const everyId = (state: EditorState) => state.content.slides.flatMap((each) => [each.id, ...each.blocks.map((block) => block.id)]);
  const knownId = (state: EditorState) => pick(everyId(state));
  const freshOrUsedId = (state: EditorState) => (random() < 0.15 ? knownId(state) : makeId());
  const blockId = (state: EditorState) => {
    const here = state.content.slides[state.selectedSlide].blocks.map((block) => block.id);
    if (here.length > 0 && random() < 0.7) return pick(here);
    return flip() ? knownId(state) : "missing0";
  };
  const someSlide = (state: EditorState): Slide =>
    slide(freshOrUsedId(state), Array.from({ length: whole(0, 3) }, () => someBlock(freshOrUsedId(state))));
  const makers: ((state: EditorState) => EditorAction)[] = [
    (state) => ({ type: "addSlide", slide: someSlide(state), at: someIndex(state) }),
    (state) => ({ type: "deleteSlide", index: someIndex(state) }),
    (state) => ({ type: "moveSlide", from: someIndex(state), to: someIndex(state) }),
    (state) => ({ type: "selectSlide", index: someIndex(state) }),
    (state) => ({ type: "addBlock", block: someBlock(freshOrUsedId(state)) }),
    () => ({ type: "addBlock", block: someBlock(makeId()) }),
    (state) => ({ type: "selectBlock", blockId: random() < 0.2 ? null : blockId(state) }),
    (state) => ({ type: "setFrame", blockId: blockId(state), frame: someFrame(), merge: flip() }),
    (state) => ({ type: "setText", blockId: blockId(state), text: someText(), merge: flip() }),
    (state) => ({
      type: "setStyle",
      blockId: blockId(state),
      style: pick([{ tone: "maroon" }, { fill: "gold" }, { fill: "ink" }, { direction: "up" }, { alt: "x".repeat(pick([10, 300])) }, {}] as const),
    }),
    (state) => ({ type: "deleteBlock", blockId: blockId(state) }),
    () => ({ type: "undo" }),
    () => ({ type: "undo" }),
    () => ({ type: "redo" }),
    (state) => (random() < 0.1 ? { type: "replace", content: flip() ? state.content : deck([someSlide(state)]) } : { type: "undo" }),
  ];
  return (state) => pick(makers)(state);
}

function expectSound(state: EditorState) {
  expect(parseDeckContent(state.content)).not.toBeNull();
  expect(Number.isInteger(state.selectedSlide)).toBe(true);
  expect(state.selectedSlide).toBeGreaterThanOrEqual(0);
  expect(state.selectedSlide).toBeLessThan(state.content.slides.length);
  const here = state.content.slides[state.selectedSlide].blocks.map((block) => block.id);
  expect(state.selectedBlock === null || here.includes(state.selectedBlock)).toBe(true);
  expect(state.past.length).toBeLessThanOrEqual(slideLimits.historySteps);
  expect(state.past.every((content) => parseDeckContent(content) !== null)).toBe(true);
  expect(state.future.every((content) => parseDeckContent(content) !== null)).toBe(true);
}

describe("random action runs", () => {
  it.each([1, 7, 2026])("stays sound through 500 actions with seed %i", (seed) => {
    const nextAction = actionSource(seed);
    let state = start();
    let changes = 0;
    for (let step = 0; step < 500; step += 1) {
      const next = run(state, nextAction(state));
      expectSound(next);
      if (next.content !== state.content) changes += 1;
      state = next;
    }
    expect(changes).toBeGreaterThan(100);
  });

  it("gives the same result for the same seed", () => {
    const play = () => {
      const nextAction = actionSource(42);
      let state = start();
      for (let step = 0; step < 200; step += 1) state = run(state, nextAction(state));
      return state;
    };
    expect(play()).toEqual(play());
  });
});
