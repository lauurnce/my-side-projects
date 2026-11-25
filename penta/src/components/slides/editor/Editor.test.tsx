import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const router = vi.hoisted(() => ({ push: vi.fn() }));

vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("@/lib/supabase/client", () => ({ createClient: () => ({ rpc: vi.fn() }) }));

import type { DeckContent } from "@/lib/slides/schema";
import { Editor } from "./Editor";

const content: DeckContent = {
  v: 1,
  slides: [
    { id: "slide001", blocks: [{ id: "title001", type: "title", x: 120, y: 120, w: 1360, h: 200, text: "Message queues", tone: "ink" }] },
    { id: "slide002", blocks: [] },
  ],
};

const save = vi.fn(async () => ({ status: "saved" as const, version: 2 }));
const publish = vi.fn(async () => ({ tone: "status" as const, message: "Published. Students in this class can see this deck." }));

function show(change: { published?: boolean; viewed?: boolean } = {}) {
  const deck = { id: "deck-1", title: "Week 3", classId: "class-1", published: false, viewed: false, ...change };
  return render(<Editor deck={deck} initialContent={content} initialVersion={1} save={save} publish={publish} />);
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("Editor", () => {
  it("shows the deck title, the slide list, the tools and the first slide", () => {
    show();
    expect(screen.getByRole("heading", { level: 1, name: "Week 3" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Back to the class" }).getAttribute("href")).toBe("/classes/class-1");
    expect(screen.getByRole("toolbar", { name: "Slide tools" })).toBeTruthy();
    expect(screen.getAllByText("Message queues").length).toBeGreaterThan(0);
    expect(screen.getByRole("status").textContent).toBe("Saved");
  });

  it("a draft offers Publish and no Present link, and says only the teacher sees it", () => {
    show();
    expect(screen.getByRole("button", { name: "Publish" })).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Present" })).toBeNull();
    expect(screen.getByText(/Only you can see this deck/)).toBeTruthy();
  });

  it("publishing shows the Present link and tells the teacher students can see the deck", async () => {
    show();
    fireEvent.click(screen.getByRole("button", { name: "Publish" }));
    await waitFor(() => expect(screen.getByRole("link", { name: "Present" }).getAttribute("href")).toBe("/decks/deck-1"));
    expect(publish).toHaveBeenCalledWith({ deckId: "deck-1" });
    expect(screen.getByText(/Students in this class can see this deck\. Changes show as you save/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Publish" })).toBeNull();
  });

  it("keeps the Publish button when publishing is refused and shows why", async () => {
    publish.mockResolvedValueOnce({ tone: "alert" as never, message: "That deck is no longer here." });
    show();
    fireEvent.click(screen.getByRole("button", { name: "Publish" }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toBe("That deck is no longer here."));
    expect(screen.getByRole("button", { name: "Publish" })).toBeTruthy();
  });

  it("saves pending edits before it leaves for the viewer", async () => {
    show({ published: true });
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    fireEvent.click(screen.getByRole("button", { name: /Duplicate slide 1/ }));
    fireEvent.click(screen.getByRole("link", { name: "Present" }));
    await waitFor(() => expect(router.push).toHaveBeenCalledWith("/decks/deck-1"));
    expect(save).toHaveBeenCalledTimes(1);
    expect(save.mock.invocationCallOrder[0]).toBeLessThan(router.push.mock.invocationCallOrder[0]);
  });

  it("tells the teacher when students have already viewed the deck", () => {
    show({ published: true, viewed: true });
    expect(screen.getByText(/Students have viewed this deck/)).toBeTruthy();
  });
});
