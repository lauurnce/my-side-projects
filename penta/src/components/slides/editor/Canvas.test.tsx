import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { EditorAction } from "@/lib/slides/editor";
import type { Slide } from "@/lib/slides/schema";
import { Canvas } from "./Canvas";

const slide: Slide = {
  id: "slide001",
  blocks: [
    { id: "title001", type: "title", x: 100, y: 100, w: 400, h: 200, text: "Message queues", tone: "ink" },
    { id: "text0001", type: "text", x: 100, y: 400, w: 600, h: 200, text: "A queue holds work\nuntil a worker is free to take it.", tone: "ink" },
    { id: "image001", type: "image", x: 900, y: 100, w: 400, h: 300, file: "0b0e7f0a-1c5d-4c56-9a43-0d3c5f1f2a11.png", alt: "A broker" },
    { id: "box00001", type: "box", x: 900, y: 500, w: 300, h: 120, text: "Broker", fill: "none" },
    { id: "arrow001", type: "arrow", x: 1300, y: 500, w: 200, h: 100, direction: "right" },
  ],
};

const titleFrame = { x: 100, y: 100, w: 400, h: 200 };
const measuredWidth = 800;

function setup(selectedBlock: string | null = null) {
  const dispatch = vi.fn<(action: EditorAction) => void>();
  const view = render(<Canvas slide={slide} selectedBlock={selectedBlock} imageBase="/images/" dispatch={dispatch} />);
  const canvas = screen.getByRole("group", { name: "Slide canvas" });
  canvas.getBoundingClientRect = () => ({ width: measuredWidth, height: 450 }) as DOMRect;
  return { dispatch, view, canvas };
}

function actions(dispatch: ReturnType<typeof setup>["dispatch"], type: EditorAction["type"]) {
  return dispatch.mock.calls.map(([action]) => action).filter((action) => action.type === type);
}

function titleButton() {
  return screen.getByRole("button", { name: "Title block: Message queues" });
}

function handle(view: ReturnType<typeof setup>["view"], corner: string) {
  const found = view.container.querySelector<HTMLElement>(`[data-corner="${corner}"]`);
  if (!found) throw new Error(`no ${corner} handle`);
  return found;
}

function startTitleEditing() {
  fireEvent.keyDown(titleButton(), { key: "Enter" });
  return screen.getByRole<HTMLTextAreaElement>("textbox");
}

beforeEach(() => {
  HTMLElement.prototype.setPointerCapture = vi.fn();
});

afterEach(() => {
  cleanup();
});

describe("Canvas blocks", () => {
  it("draws one named button for each block", () => {
    setup();
    expect(screen.getAllByRole("button")).toHaveLength(5);
    expect(titleButton()).toBeTruthy();
    expect(screen.getByRole("button", { name: "Text block: A queue holds work until a worker is fre" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Image block: A broker" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Box block: Broker" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Arrow block" })).toBeTruthy();
  });

  it("marks the selected block and gives it four handles that are not tab stops", () => {
    const { view } = setup("title001");
    expect(titleButton().getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: "Arrow block" }).getAttribute("aria-pressed")).toBe("false");
    const handles = view.container.querySelectorAll<HTMLElement>("[data-corner]");
    expect([...handles].map((item) => item.dataset.corner)).toEqual(["nw", "ne", "sw", "se"]);
    expect([...handles].every((item) => item.tabIndex < 0)).toBe(true);
  });

  it("shows no handles when nothing is selected", () => {
    const { view } = setup();
    expect(view.container.querySelectorAll("[data-corner]")).toHaveLength(0);
  });
});

describe("Canvas pointer", () => {
  it("selects the block, then sets the frame once, moved by the pointer delta over the scale", () => {
    const { dispatch } = setup();
    const button = titleButton();
    fireEvent.pointerDown(button, { pointerId: 1, button: 0, clientX: 200, clientY: 200 });
    fireEvent.pointerMove(button, { pointerId: 1, clientX: 220, clientY: 205 });
    fireEvent.pointerMove(button, { pointerId: 1, clientX: 250, clientY: 220 });
    expect(actions(dispatch, "setFrame")).toHaveLength(0);
    expect(button.style.left).toBe("120px");
    fireEvent.pointerUp(button, { pointerId: 1, clientX: 250, clientY: 220 });
    expect(dispatch.mock.calls.map(([action]) => action)).toEqual([
      { type: "selectBlock", blockId: "title001" },
      { type: "setFrame", blockId: "title001", frame: { x: 200, y: 140, w: 400, h: 200 }, merge: false },
    ]);
    expect(button.style.left).toBe("60px");
  });

  it("captures the pointer", () => {
    setup();
    fireEvent.pointerDown(titleButton(), { pointerId: 7, button: 0, clientX: 200, clientY: 200 });
    expect(HTMLElement.prototype.setPointerCapture).toHaveBeenCalledWith(7);
  });

  it("sets no frame for a click without movement", () => {
    const { dispatch } = setup();
    const button = titleButton();
    fireEvent.pointerDown(button, { pointerId: 1, button: 0, clientX: 200, clientY: 200 });
    fireEvent.pointerUp(button, { pointerId: 1, clientX: 200, clientY: 200 });
    expect(dispatch.mock.calls.map(([action]) => action)).toEqual([{ type: "selectBlock", blockId: "title001" }]);
  });

  it("sets no frame when the pointer is cancelled", () => {
    const { dispatch } = setup();
    const button = titleButton();
    fireEvent.pointerDown(button, { pointerId: 1, button: 0, clientX: 200, clientY: 200 });
    fireEvent.pointerMove(button, { pointerId: 1, clientX: 300, clientY: 300 });
    fireEvent.pointerCancel(button, { pointerId: 1 });
    fireEvent.pointerUp(button, { pointerId: 1, clientX: 300, clientY: 300 });
    expect(actions(dispatch, "setFrame")).toHaveLength(0);
    expect(button.style.left).toBe("60px");
  });

  it("sets no frame when pointer capture is lost", () => {
    const { dispatch } = setup();
    const button = titleButton();
    fireEvent.pointerDown(button, { pointerId: 1, button: 0, clientX: 200, clientY: 200 });
    fireEvent.pointerMove(button, { pointerId: 1, clientX: 300, clientY: 300 });
    fireEvent.lostPointerCapture(button, { pointerId: 1 });
    expect(actions(dispatch, "setFrame")).toHaveLength(0);
    expect(button.style.left).toBe("60px");
  });

  it("resizes from the south east corner with the north west corner fixed", () => {
    const { dispatch, view } = setup("title001");
    const corner = handle(view, "se");
    fireEvent.pointerDown(corner, { pointerId: 1, button: 0, clientX: 300, clientY: 180 });
    fireEvent.pointerMove(corner, { pointerId: 1, clientX: 350, clientY: 200 });
    fireEvent.pointerUp(corner, { pointerId: 1, clientX: 350, clientY: 200 });
    expect(dispatch.mock.calls.map(([action]) => action)).toEqual([
      { type: "setFrame", blockId: "title001", frame: { x: 100, y: 100, w: 500, h: 240 }, merge: false },
    ]);
  });

  it("resizes from the north west corner with the south east corner fixed", () => {
    const { dispatch, view } = setup("title001");
    const corner = handle(view, "nw");
    fireEvent.pointerDown(corner, { pointerId: 1, button: 0, clientX: 60, clientY: 60 });
    fireEvent.pointerMove(corner, { pointerId: 1, clientX: 80, clientY: 70 });
    fireEvent.pointerUp(corner, { pointerId: 1, clientX: 80, clientY: 70 });
    expect(actions(dispatch, "setFrame")).toEqual([
      { type: "setFrame", blockId: "title001", frame: { x: 140, y: 120, w: 360, h: 180 }, merge: false },
    ]);
  });

  it("clears the selection on empty canvas", () => {
    const { dispatch } = setup("title001");
    const overlay = titleButton().parentElement as HTMLElement;
    fireEvent.pointerDown(overlay, { pointerId: 1, button: 0, clientX: 700, clientY: 20 });
    expect(dispatch.mock.calls.map(([action]) => action)).toEqual([{ type: "selectBlock", blockId: null }]);
  });
});

describe("Canvas keyboard", () => {
  it("moves by 8 with an arrow and by 1 with Shift", () => {
    const { dispatch } = setup("title001");
    fireEvent.keyDown(titleButton(), { key: "ArrowRight" });
    fireEvent.keyDown(titleButton(), { key: "ArrowUp", shiftKey: true });
    expect(actions(dispatch, "setFrame")).toEqual([
      { type: "setFrame", blockId: "title001", frame: { ...titleFrame, x: 108 }, merge: false },
      { type: "setFrame", blockId: "title001", frame: { ...titleFrame, y: 99 }, merge: false },
    ]);
  });

  it("resizes with Alt", () => {
    const { dispatch } = setup("title001");
    fireEvent.keyDown(titleButton(), { key: "ArrowDown", altKey: true });
    fireEvent.keyDown(titleButton(), { key: "ArrowLeft", altKey: true, shiftKey: true });
    expect(actions(dispatch, "setFrame")).toEqual([
      { type: "setFrame", blockId: "title001", frame: { ...titleFrame, h: 208 }, merge: false },
      { type: "setFrame", blockId: "title001", frame: { ...titleFrame, w: 399 }, merge: false },
    ]);
  });

  it("merges a repeated key press", () => {
    const { dispatch } = setup("title001");
    fireEvent.keyDown(titleButton(), { key: "ArrowRight", repeat: true });
    expect(actions(dispatch, "setFrame")).toEqual([
      { type: "setFrame", blockId: "title001", frame: { ...titleFrame, x: 108 }, merge: true },
    ]);
  });

  it("prevents the default action of a handled key", () => {
    setup("title001");
    expect(fireEvent.keyDown(titleButton(), { key: "ArrowRight" })).toBe(false);
    expect(fireEvent.keyDown(titleButton(), { key: "Delete" })).toBe(false);
    expect(fireEvent.keyDown(titleButton(), { key: "z", ctrlKey: true })).toBe(false);
    expect(fireEvent.keyDown(titleButton(), { key: "a" })).toBe(true);
  });

  it("sends nothing when the frame cannot change", () => {
    const edge: Slide = { id: "slide002", blocks: [{ id: "arrow002", type: "arrow", x: 0, y: 0, w: 24, h: 24, direction: "up" }] };
    const dispatch = vi.fn();
    render(<Canvas slide={edge} selectedBlock="arrow002" imageBase="/images/" dispatch={dispatch} />);
    const button = screen.getByRole("button", { name: "Arrow block" });
    fireEvent.keyDown(button, { key: "ArrowLeft" });
    fireEvent.keyDown(button, { key: "ArrowUp", altKey: true });
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("deletes with Delete and with Backspace", () => {
    const { dispatch } = setup("title001");
    fireEvent.keyDown(titleButton(), { key: "Delete" });
    fireEvent.keyDown(titleButton(), { key: "Backspace" });
    expect(dispatch.mock.calls.map(([action]) => action)).toEqual([
      { type: "deleteBlock", blockId: "title001" },
      { type: "deleteBlock", blockId: "title001" },
    ]);
  });

  it("deselects with Escape", () => {
    const { dispatch } = setup("title001");
    fireEvent.keyDown(titleButton(), { key: "Escape" });
    expect(dispatch.mock.calls.map(([action]) => action)).toEqual([{ type: "selectBlock", blockId: null }]);
  });

  it("selects a block that gets keyboard focus", () => {
    const { dispatch } = setup();
    fireEvent.focus(titleButton());
    expect(dispatch.mock.calls.map(([action]) => action)).toEqual([{ type: "selectBlock", blockId: "title001" }]);
  });

  it("undoes and redoes", () => {
    const { dispatch } = setup("title001");
    fireEvent.keyDown(titleButton(), { key: "z", ctrlKey: true });
    fireEvent.keyDown(titleButton(), { key: "z", metaKey: true });
    fireEvent.keyDown(titleButton(), { key: "Z", ctrlKey: true, shiftKey: true });
    fireEvent.keyDown(titleButton(), { key: "z", metaKey: true, shiftKey: true });
    fireEvent.keyDown(titleButton(), { key: "y", ctrlKey: true });
    expect(dispatch.mock.calls.map(([action]) => action.type)).toEqual(["undo", "undo", "redo", "redo", "redo"]);
  });
});

describe("Canvas text editing", () => {
  it("opens a focused textarea with the block text on Enter", () => {
    setup("title001");
    const field = startTitleEditing();
    expect(field.value).toBe("Message queues");
    expect(field.maxLength).toBe(200);
    expect(document.activeElement).toBe(field);
    expect(field.selectionStart).toBe("Message queues".length);
  });

  it("opens on a double click and not for an arrow or an image", () => {
    setup();
    fireEvent.doubleClick(screen.getByRole("button", { name: "Arrow block" }));
    fireEvent.keyDown(screen.getByRole("button", { name: "Image block: A broker" }), { key: "Enter" });
    expect(screen.queryByRole("textbox")).toBeNull();
    fireEvent.doubleClick(screen.getByRole("button", { name: "Box block: Broker" }));
    expect(screen.getByRole<HTMLTextAreaElement>("textbox").value).toBe("Broker");
  });

  it("sends the first change unmerged and the next ones merged", () => {
    const { dispatch } = setup("title001");
    const field = startTitleEditing();
    fireEvent.change(field, { target: { value: "Message queues!" } });
    fireEvent.change(field, { target: { value: "Message queues!!" } });
    expect(actions(dispatch, "setText")).toEqual([
      { type: "setText", blockId: "title001", text: "Message queues!", merge: false },
      { type: "setText", blockId: "title001", text: "Message queues!!", merge: true },
    ]);
  });

  it("starts a new history step for each editing run", () => {
    const { dispatch } = setup("title001");
    fireEvent.change(startTitleEditing(), { target: { value: "One" } });
    fireEvent.keyDown(screen.getByRole("textbox"), { key: "Enter" });
    fireEvent.change(startTitleEditing(), { target: { value: "Two" } });
    expect(actions(dispatch, "setText").map((action) => action.type === "setText" && action.merge)).toEqual([false, false]);
  });

  it("ends editing on Enter in a title and returns focus to the block", () => {
    setup("title001");
    fireEvent.keyDown(startTitleEditing(), { key: "Enter" });
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(document.activeElement).toBe(titleButton());
  });

  it("keeps editing on Enter in a text block and keeps its line breaks", () => {
    const { dispatch } = setup("text0001");
    fireEvent.keyDown(screen.getByRole("button", { name: /^Text block/ }), { key: "Enter" });
    const field = screen.getByRole<HTMLTextAreaElement>("textbox");
    expect(field.maxLength).toBe(2000);
    fireEvent.keyDown(field, { key: "Enter" });
    expect(screen.getByRole("textbox")).toBe(field);
    fireEvent.change(field, { target: { value: "One\nTwo" } });
    expect(actions(dispatch, "setText")).toEqual([{ type: "setText", blockId: "text0001", text: "One\nTwo", merge: false }]);
  });

  it("turns a pasted line break in a title into a space", () => {
    const { dispatch } = setup("title001");
    fireEvent.change(startTitleEditing(), { target: { value: "Message\r\nqueues\nnow" } });
    expect(actions(dispatch, "setText")).toEqual([
      { type: "setText", blockId: "title001", text: "Message queues now", merge: false },
    ]);
  });

  it("ends editing on Escape and on blur", () => {
    setup("title001");
    fireEvent.keyDown(startTitleEditing(), { key: "Escape" });
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(document.activeElement).toBe(titleButton());
    fireEvent.blur(startTitleEditing());
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("keeps arrows, Delete and undo keys inside the textarea", () => {
    const { dispatch } = setup("title001");
    const field = startTitleEditing();
    dispatch.mockClear();
    expect(fireEvent.keyDown(field, { key: "ArrowLeft" })).toBe(true);
    expect(fireEvent.keyDown(field, { key: "Delete" })).toBe(true);
    expect(fireEvent.keyDown(field, { key: "Backspace" })).toBe(true);
    expect(fireEvent.keyDown(field, { key: "z", ctrlKey: true })).toBe(true);
    expect(fireEvent.keyDown(field, { key: "z", metaKey: true, shiftKey: true })).toBe(true);
    expect(dispatch).not.toHaveBeenCalled();
  });
});
