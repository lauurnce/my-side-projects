import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { slideLimits } from "@/lib/config";
import type { EditorAction } from "@/lib/slides/editor";
import { parseDeckContent, type Block, type Slide } from "@/lib/slides/schema";
import { Toolbar, type PickImage } from "./Toolbar";

const idPattern = /^[a-z0-9]{8}$/;
const storedName = "0a1b2c3d-0000-4000-8000-0123456789ab.png";

const title: Block = { id: "title001", type: "title", x: 120, y: 100, w: 1360, h: 190, text: "Message queues", tone: "ink" };
const text: Block = { id: "text0001", type: "text", x: 120, y: 330, w: 1360, h: 200, text: "A queue holds messages.", tone: "maroon" };
const box: Block = { id: "box00001", type: "box", x: 120, y: 560, w: 360, h: 200, text: "Broker", fill: "ink" };
const goldBox: Block = { id: "box00002", type: "box", x: 520, y: 560, w: 360, h: 200, text: "Consumer", fill: "gold" };
const arrow: Block = { id: "arrow001", type: "arrow", x: 900, y: 620, w: 100, h: 80, direction: "right" };
const image: Block = { id: "image001", type: "image", x: 1040, y: 560, w: 400, h: 240, file: storedName, alt: "A queue" };

type Options = {
  blocks?: Block[];
  selectedBlock?: Block | null;
  canUndo?: boolean;
  canRedo?: boolean;
  onPickImage?: PickImage;
};

function show({ blocks = [title, text, box, arrow, image], selectedBlock = null, canUndo = false, canRedo = false, onPickImage }: Options = {}) {
  const dispatch = vi.fn<(action: EditorAction) => void>();
  const pick = vi.fn<PickImage>(onPickImage ?? (async () => null));
  const slide: Slide = { id: "slide001", blocks };
  render(<Toolbar slide={slide} selectedBlock={selectedBlock} canUndo={canUndo} canRedo={canRedo} dispatch={dispatch} onPickImage={pick} />);
  return { dispatch, pick };
}

function button(name: string) {
  return screen.getByRole<HTMLButtonElement>("button", { name });
}

function option(group: string, name: string) {
  return within(screen.getByRole("group", { name: group })).getByRole<HTMLButtonElement>("button", { name });
}

function optionNames(group: string) {
  return within(screen.getByRole("group", { name: group }))
    .getAllByRole("button")
    .map((item) => item.textContent);
}

function imageInput() {
  return screen.getByLabelText<HTMLInputElement>("Image");
}

function chooseFile(name = "photo.png") {
  const file = new File(["pixels"], name, { type: "image/png" });
  fireEvent.change(imageInput(), { target: { files: [file] } });
  return file;
}

function fullSlide(): Block[] {
  return Array.from({ length: slideLimits.blocksPerSlide }, (_, index) => ({
    ...arrow,
    id: `arrow${String(index).padStart(3, "0")}`,
  }));
}

afterEach(cleanup);

describe("Toolbar", () => {
  it("is a toolbar named Slide tools", () => {
    show();
    expect(screen.getByRole("toolbar", { name: "Slide tools" })).toBeTruthy();
  });

  it.each([
    ["Title", "title"],
    ["Text", "text"],
    ["Box", "box"],
    ["Arrow", "arrow"],
  ])("adds a block from the %s button", (name, type) => {
    const { dispatch } = show();
    fireEvent.click(within(screen.getByRole("group", { name: "Add a block" })).getByRole("button", { name }));
    expect(dispatch).toHaveBeenCalledTimes(1);
    const action = dispatch.mock.calls[0][0];
    if (action.type !== "addBlock") throw new Error("expected addBlock");
    expect(action.block.type).toBe(type);
    expect(action.block.id).toMatch(idPattern);
    expect(parseDeckContent({ v: 1, slides: [{ id: "slide001", blocks: [action.block] }] })).not.toBeNull();
  });

  it("takes png, jpeg and webp images", () => {
    show();
    expect(imageInput().type).toBe("file");
    expect(imageInput().accept).toBe("image/png,image/jpeg,image/webp");
  });

  it("adds an image block with the name the upload returns", async () => {
    const { dispatch, pick } = show({ onPickImage: async () => storedName });
    const file = chooseFile();
    await waitFor(() => expect(dispatch).toHaveBeenCalledTimes(1));
    expect(pick).toHaveBeenCalledWith(file);
    const action = dispatch.mock.calls[0][0];
    if (action.type !== "addBlock") throw new Error("expected addBlock");
    expect(action.block).toMatchObject({ type: "image", file: storedName, alt: "" });
    expect(action.block.id).toMatch(idPattern);
    expect(parseDeckContent({ v: 1, slides: [{ id: "slide001", blocks: [action.block] }] })).not.toBeNull();
  });

  it("adds nothing when the upload fails", async () => {
    const { dispatch, pick } = show({ onPickImage: async () => null });
    chooseFile();
    await waitFor(() => expect(pick).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(imageInput().disabled).toBe(false));
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("turns the image control off while an upload is pending, then clears it", async () => {
    let finish: (name: string | null) => void = () => {};
    const { dispatch } = show({ onPickImage: () => new Promise((resolve) => (finish = resolve)) });
    chooseFile();
    await waitFor(() => expect(imageInput().disabled).toBe(true));
    expect(dispatch).not.toHaveBeenCalled();
    finish(storedName);
    await waitFor(() => expect(imageInput().disabled).toBe(false));
    expect(imageInput().value).toBe("");
    expect(dispatch).toHaveBeenCalledTimes(1);
  });

  it("lets the same file be chosen twice", async () => {
    const { pick } = show({ onPickImage: async () => storedName });
    chooseFile();
    await waitFor(() => expect(imageInput().disabled).toBe(false));
    chooseFile();
    await waitFor(() => expect(pick).toHaveBeenCalledTimes(2));
  });

  it("turns every add control off when the slide is full", () => {
    const { dispatch } = show({ blocks: fullSlide() });
    for (const name of ["Title", "Text", "Box", "Arrow"]) {
      expect(button(name).disabled).toBe(true);
      fireEvent.click(button(name));
    }
    expect(imageInput().disabled).toBe(true);
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("keeps the add controls on one block below the limit", () => {
    show({ blocks: fullSlide().slice(1) });
    expect(button("Title").disabled).toBe(false);
    expect(imageInput().disabled).toBe(false);
  });

  it("turns undo and redo off when there is nothing to step through", () => {
    const { dispatch } = show();
    expect(button("Undo").disabled).toBe(true);
    expect(button("Redo").disabled).toBe(true);
    fireEvent.click(button("Undo"));
    fireEvent.click(button("Redo"));
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("sends undo and redo", () => {
    const { dispatch } = show({ canUndo: true, canRedo: true });
    fireEvent.click(button("Undo"));
    fireEvent.click(button("Redo"));
    expect(dispatch.mock.calls.map(([action]) => action)).toEqual([{ type: "undo" }, { type: "redo" }]);
  });

  it("turns on only the side that has history", () => {
    show({ canUndo: true, canRedo: false });
    expect(button("Undo").disabled).toBe(false);
    expect(button("Redo").disabled).toBe(true);
  });

  it("shows a hint and no block controls when nothing is selected", () => {
    show();
    expect(screen.getByText("Select a block to change it.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Delete block" })).toBeNull();
    expect(screen.queryByRole("group", { name: "Tone" })).toBeNull();
  });

  it.each([
    ["title", title, "Ink"],
    ["text", text, "Maroon"],
  ])("sets the tone of a %s block", (_name, block, current) => {
    const { dispatch } = show({ selectedBlock: block });
    expect(optionNames("Tone")).toEqual(["Ink", "Maroon"]);
    expect(option("Tone", "Ink").getAttribute("aria-pressed")).toBe(String(current === "Ink"));
    expect(option("Tone", "Maroon").getAttribute("aria-pressed")).toBe(String(current === "Maroon"));
    fireEvent.click(option("Tone", "Maroon"));
    fireEvent.click(option("Tone", "Ink"));
    expect(dispatch.mock.calls.map(([action]) => action)).toEqual([
      { type: "setStyle", blockId: block.id, style: { tone: "maroon" } },
      { type: "setStyle", blockId: block.id, style: { tone: "ink" } },
    ]);
    expect(screen.queryByText("Select a block to change it.")).toBeNull();
  });

  it("sets the fill of a box", () => {
    const { dispatch } = show({ selectedBlock: box });
    expect(optionNames("Fill")).toEqual(["None", "Ink", "Parchment", "Cream", "Maroon", "Gold"]);
    expect(option("Fill", "Ink").getAttribute("aria-pressed")).toBe("true");
    expect(option("Fill", "None").getAttribute("aria-pressed")).toBe("false");
    for (const name of ["None", "Ink", "Parchment", "Cream", "Maroon", "Gold"]) fireEvent.click(option("Fill", name));
    expect(dispatch.mock.calls.map(([action]) => action)).toEqual(
      ["none", "ink", "parchment", "cream", "maroon", "gold"].map((fill) => ({ type: "setStyle", blockId: box.id, style: { fill } })),
    );
  });

  it("turns gold off when another box on the slide is gold", () => {
    const { dispatch } = show({ blocks: [box, goldBox], selectedBlock: box });
    expect(option("Fill", "Gold").disabled).toBe(true);
    expect(option("Fill", "Maroon").disabled).toBe(false);
    fireEvent.click(option("Fill", "Gold"));
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("keeps gold on for the box that already holds it", () => {
    show({ blocks: [box, goldBox], selectedBlock: goldBox });
    expect(option("Fill", "Gold").disabled).toBe(false);
    expect(option("Fill", "Gold").getAttribute("aria-pressed")).toBe("true");
  });

  it("sets the direction of an arrow", () => {
    const { dispatch } = show({ selectedBlock: arrow });
    expect(optionNames("Direction")).toEqual(["Right", "Left", "Up", "Down"]);
    expect(option("Direction", "Right").getAttribute("aria-pressed")).toBe("true");
    for (const name of ["Left", "Up", "Down", "Right"]) fireEvent.click(option("Direction", name));
    expect(dispatch.mock.calls.map(([action]) => action)).toEqual(
      ["left", "up", "down", "right"].map((direction) => ({ type: "setStyle", blockId: arrow.id, style: { direction } })),
    );
  });

  it("edits the description of an image", () => {
    const { dispatch } = show({ selectedBlock: image });
    const input = screen.getByLabelText<HTMLInputElement>("Description");
    expect(input.value).toBe("A queue");
    expect(input.maxLength).toBe(slideLimits.altLength);
    fireEvent.change(input, { target: { value: "A queue of messages" } });
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(dispatch).toHaveBeenCalledWith({ type: "setStyle", blockId: image.id, style: { alt: "A queue of messages" } });
  });

  it("shows only the controls that fit the selected block", () => {
    show({ selectedBlock: arrow });
    expect(screen.queryByRole("group", { name: "Tone" })).toBeNull();
    expect(screen.queryByRole("group", { name: "Fill" })).toBeNull();
    expect(screen.queryByLabelText("Description")).toBeNull();
  });

  it("deletes the selected block", () => {
    const { dispatch } = show({ selectedBlock: box });
    fireEvent.click(button("Delete block"));
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(dispatch).toHaveBeenCalledWith({ type: "deleteBlock", blockId: box.id });
  });
});
