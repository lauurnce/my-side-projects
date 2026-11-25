import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { DeckSummary } from "@/lib/decks";
import { DeckList } from "./DeckList";
import { deckMeta } from "./labels";
import { NewDeckForm } from "./NewDeckForm";

const base: DeckSummary = {
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  classId: "class-1",
  lessonId: null,
  title: "Message queues",
  kind: "native",
  slideCount: 3,
  sizeBytes: 2048,
  ready: false,
  viewedCount: 0,
};
const uploaded: DeckSummary = { ...base, id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", title: "Week 1", kind: "pdf", ready: true };

function list(decks: DeckSummary[]) {
  return render(<DeckList decks={decks} lessons={[]} state={{}} formAction={vi.fn()} pending={false} />);
}

afterEach(cleanup);

describe("decks made in the editor, in the teacher list", () => {
  it("a draft says Draft, links to the editor, and has no viewer link or export", () => {
    list([base]);
    const row = within(screen.getByRole("listitem"));
    expect(row.getByText("Draft")).toBeTruthy();
    expect(row.queryByText("Not finished")).toBeNull();
    expect(row.getByRole("link", { name: "Edit Message queues" }).getAttribute("href")).toBe(`/decks/${base.id}/edit`);
    expect(row.queryByRole("link", { name: "Message queues" })).toBeNull();
    expect(row.queryByRole("link", { name: /Export PDF/ })).toBeNull();
    expect(deckMeta(base)).toBe("3 slides · SLIDES · 2 KB");
  });

  it("a published one opens in the viewer and offers Edit and Export PDF", () => {
    list([{ ...base, ready: true }]);
    const row = within(screen.getByRole("listitem"));
    expect(row.getByRole("link", { name: "Message queues" }).getAttribute("href")).toBe(`/decks/${base.id}`);
    expect(row.getByRole("link", { name: "Edit Message queues" })).toBeTruthy();
    expect(row.getByRole("link", { name: "Export PDF Message queues" }).getAttribute("href")).toBe(`/decks/${base.id}/download`);
  });

  it("an uploaded deck has no Edit link", () => {
    list([uploaded]);
    expect(screen.queryByRole("link", { name: /^Edit/ })).toBeNull();
    expect(screen.getByRole("link", { name: "Download Week 1" })).toBeTruthy();
  });
});

describe("NewDeckForm", () => {
  it("sends the class with the title and lesson fields", () => {
    const { container } = render(<NewDeckForm classId="class-1" lessons={[]} action={vi.fn()} />);
    expect(screen.getByRole("form", { name: "Make a deck in PENTA" })).toBeTruthy();
    expect(screen.getByLabelText("New deck title").getAttribute("maxlength")).toBe("120");
    expect(container.querySelector('input[name="classId"]')?.getAttribute("value")).toBe("class-1");
    expect(screen.getByRole("combobox", { name: "Lesson for the new deck" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "New deck" })).toBeTruthy();
  });
});
