import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { DeckContent } from "@/lib/slides/schema";
import { Editor } from "./Editor";

const content: DeckContent = {
  v: 1,
  slides: [
    { id: "slide001", blocks: [{ id: "title001", type: "title", x: 120, y: 120, w: 1360, h: 200, text: "Message queues", tone: "ink" }] },
    { id: "slide002", blocks: [] },
  ],
};

describe("Editor", () => {
  it("shows the deck title, the slide list, the tools and the first slide", () => {
    render(<Editor deck={{ id: "deck-1", title: "Week 3", classId: "class-1", published: false }} initialContent={content} initialVersion={1} />);
    expect(screen.getByRole("heading", { level: 1, name: "Week 3" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Back to the class" }).getAttribute("href")).toBe("/classes/class-1");
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    expect(screen.getByRole("toolbar", { name: "Slide tools" })).toBeTruthy();
    expect(screen.getByText("Message queues")).toBeTruthy();
  });
});
