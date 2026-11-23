import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { megabyte } from "@/lib/config";
import type { DeckSummary, StorageUsage } from "@/lib/decks";
import type { ClassOutline } from "@/lib/routes";
import { DeckList } from "./DeckList";
import { deckCountLabel, deckMeta, isLinkedToDraft, lessonGroups, takenPercent } from "./labels";
import { StorageMeter } from "./StorageMeter";

afterEach(cleanup);

const classId = "3f2b8c1e-6a4d-4e5f-9b7a-1c2d3e4f5a6b";
const weekOne = "11111111-1111-4111-8111-111111111111";
const weekTwo = "22222222-2222-4222-8222-222222222222";
const brokers = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const queues = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const readyId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const pendingId = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const pptxId = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";

const outline: ClassOutline = {
  classId,
  modules: [
    {
      id: weekOne,
      classId,
      title: "Week 1",
      lessons: [
        { id: brokers, moduleId: weekOne, title: "Message brokers", estMinutes: 12, published: true, done: false },
        { id: queues, moduleId: weekOne, title: "Queues", estMinutes: 10, published: false, done: false },
      ],
    },
    { id: weekTwo, classId, title: "Week 2", lessons: [] },
  ],
};

const lessons = lessonGroups(outline);

const readyDeck: DeckSummary = {
  id: readyId,
  classId,
  lessonId: brokers,
  title: "Brokers in practice",
  kind: "pdf",
  slideCount: 24,
  sizeBytes: 3.2 * megabyte,
  ready: true,
  viewedCount: 0,
};

const pendingDeck: DeckSummary = {
  ...readyDeck,
  id: pendingId,
  lessonId: null,
  title: "Half uploaded",
  slideCount: 0,
  sizeBytes: 48 * megabyte,
  ready: false,
};

const pptxDeck: DeckSummary = {
  ...readyDeck,
  id: pptxId,
  lessonId: queues,
  title: "Queues workshop",
  kind: "pptx",
  slideCount: 1,
  sizeBytes: 12 * megabyte,
};

function usage(usedMegabytes: number, reservedMegabytes = 0): StorageUsage {
  return {
    usedBytes: usedMegabytes * megabyte,
    reservedBytes: reservedMegabytes * megabyte,
    budgetBytes: 700 * megabyte,
  };
}

function renderList(decks: DeckSummary[], pending = false) {
  return render(<DeckList decks={decks} lessons={lessons} state={{}} formAction={() => {}} pending={pending} />);
}

function row(title: string) {
  return within(screen.getByText(title).closest("li") as HTMLElement);
}

function hiddenValues(element: HTMLElement): Record<string, string> {
  const inputs = element.closest("form")!.querySelectorAll<HTMLInputElement>('input[type="hidden"]');
  return Object.fromEntries([...inputs].map((input) => [input.name, input.value]));
}

describe("storage meter", () => {
  it("writes the usage as a sentence when there is room", () => {
    const { container } = render(<StorageMeter usage={usage(312)} />);
    expect(screen.getByText("Deck storage: 312 MB of 700 MB used")).toBeTruthy();
    expect(screen.getByText("44% taken")).toBeTruthy();
    expect(screen.queryByText(/almost full/)).toBeNull();
    expect(screen.queryByText(/reserved/)).toBeNull();
    expect(container.querySelector("[data-level]")?.getAttribute("data-level")).toBe("ok");
  });

  it("names reserved bytes apart from used bytes", () => {
    render(<StorageMeter usage={usage(312, 12)} />);
    expect(screen.getByText("12 MB reserved by uploads in progress")).toBeTruthy();
    expect(screen.getByText("46% taken")).toBeTruthy();
  });

  it("warns in words when storage is almost full", () => {
    const { container } = render(<StorageMeter usage={usage(640)} />);
    expect(screen.getByText("Storage is almost full. Delete decks you no longer need.")).toBeTruthy();
    expect(container.querySelector("[data-level]")?.getAttribute("data-level")).toBe("nearly_full");
  });

  it("keeps the warning when storage is full", () => {
    const { container } = render(<StorageMeter usage={usage(690, 10)} />);
    expect(screen.getByText("Storage is almost full. Delete decks you no longer need.")).toBeTruthy();
    expect(screen.getByText("100% taken")).toBeTruthy();
    expect(container.querySelector("[data-level]")?.getAttribute("data-level")).toBe("full");
  });

  it("says so when the usage could not be loaded", () => {
    render(<StorageMeter usage={null} />);
    expect(screen.getByText("Deck storage could not be loaded.")).toBeTruthy();
  });

  it("keeps the bar inside its track", () => {
    expect(takenPercent(usage(900))).toBe(100);
    expect(takenPercent({ usedBytes: 5, reservedBytes: 0, budgetBytes: 0 })).toBe(100);
    expect(takenPercent(usage(0))).toBe(0);
  });
});

describe("deck labels", () => {
  it("writes slides, format and size", () => {
    expect(deckMeta(readyDeck)).toBe("24 slides · PDF · 3.2 MB");
    expect(deckMeta(pptxDeck)).toBe("1 slide · PPTX · 12 MB");
    expect(deckMeta(pendingDeck)).toBe("PDF · 48 MB");
  });

  it("counts decks in words", () => {
    expect([deckCountLabel(0), deckCountLabel(1), deckCountLabel(2)]).toEqual(["0 decks", "1 deck", "2 decks"]);
  });

  it("lists every lesson by module and marks drafts", () => {
    expect(lessons).toEqual([
      {
        moduleId: weekOne,
        moduleTitle: "Week 1",
        lessons: [
          { id: brokers, label: "Message brokers", published: true },
          { id: queues, label: "Queues (Draft)", published: false },
        ],
      },
    ]);
  });

  it("knows when a deck waits on a draft lesson", () => {
    expect(isLinkedToDraft(readyDeck, lessons)).toBe(false);
    expect(isLinkedToDraft(pptxDeck, lessons)).toBe(true);
    expect(isLinkedToDraft(pendingDeck, lessons)).toBe(false);
  });
});

describe("deck list", () => {
  it("shows the empty state", () => {
    renderList([]);
    expect(screen.getByText("No decks yet. Upload the first one.")).toBeTruthy();
    expect(screen.queryByRole("list")).toBeNull();
  });

  it("links a ready deck to its viewer and its download", () => {
    renderList([readyDeck]);
    const deck = row("Brokers in practice");
    expect(deck.getByRole("link", { name: "Brokers in practice" }).getAttribute("href")).toBe(`/decks/${readyId}`);
    expect(deck.getByRole("link", { name: "Download Brokers in practice" }).getAttribute("href")).toBe(
      `/decks/${readyId}/download`,
    );
    expect(deck.getByText("24 slides · PDF · 3.2 MB")).toBeTruthy();
    expect(deck.queryByText("Not finished")).toBeNull();
  });

  it("marks an unfinished deck and gives it no link and no download", () => {
    renderList([pendingDeck]);
    const deck = row("Half uploaded");
    expect(deck.getByText("Not finished")).toBeTruthy();
    expect(deck.getByText("PDF · 48 MB")).toBeTruthy();
    expect(deck.queryByRole("link")).toBeNull();
    expect(deck.getByRole("button", { name: "Delete deck Half uploaded" })).toBeTruthy();
  });

  it("selects the linked lesson and offers every lesson", () => {
    renderList([readyDeck, pendingDeck]);
    const linked = row("Brokers in practice").getByRole("combobox", {
      name: "Lesson for Brokers in practice",
    }) as HTMLSelectElement;
    const unlinked = row("Half uploaded").getByRole("combobox", { name: "Lesson for Half uploaded" }) as HTMLSelectElement;
    expect(linked.value).toBe(brokers);
    expect(unlinked.value).toBe("");
    expect([...linked.options].map((option) => option.textContent)).toEqual([
      "No lesson",
      "Message brokers",
      "Queues (Draft)",
    ]);
  });

  it("tells the teacher when the linked lesson is a draft", () => {
    renderList([readyDeck, pptxDeck]);
    expect(row("Queues workshop").getByText("Students see this deck after the lesson is published.")).toBeTruthy();
    expect(row("Brokers in practice").queryByText(/after the lesson is published/)).toBeNull();
  });

  it("posts the deck id with each form", () => {
    renderList([readyDeck]);
    const deck = row("Brokers in practice");
    const save = deck.getByRole("button", { name: "Save lesson for Brokers in practice" });
    const remove = deck.getByRole("button", { name: "Delete deck Brokers in practice" });
    expect(hiddenValues(save)).toEqual({ intent: "setDeckLesson", deckId: readyId });
    expect(hiddenValues(remove)).toEqual({ intent: "deleteDeck", deckId: readyId });
    expect((save.closest("form")!.elements.namedItem("lessonId") as HTMLSelectElement).value).toBe(brokers);
  });

  it("disables the buttons while an action runs", () => {
    renderList([readyDeck], true);
    const buttons = screen.getAllByRole("button") as HTMLButtonElement[];
    expect(buttons.length).toBe(2);
    expect(buttons.every((button) => button.disabled)).toBe(true);
  });

  it("shows a success as a status and a failure as an alert", () => {
    const { rerender } = render(
      <DeckList
        decks={[readyDeck]}
        lessons={lessons}
        state={{ tone: "status", message: "Deck deleted" }}
        formAction={() => {}}
        pending={false}
      />,
    );
    expect(screen.getByRole("status").textContent).toBe("Deck deleted");
    rerender(
      <DeckList
        decks={[readyDeck]}
        lessons={lessons}
        state={{ tone: "alert", message: "That deck is no longer here." }}
        formAction={() => {}}
        pending={false}
      />,
    );
    expect(screen.getByRole("alert").textContent).toBe("That deck is no longer here.");
  });

  it("renders a title as text", () => {
    const markup = '<img src=x onerror="alert(1)">';
    const { container } = renderList([{ ...readyDeck, title: markup }]);
    expect(screen.getByRole("link", { name: markup })).toBeTruthy();
    expect(container.querySelector("img")).toBeNull();
  });
});

describe("live chip in the deck list", () => {
  it("shows Live next to the title of a deck with a running session", () => {
    const { container } = render(
      <DeckList
        decks={[readyDeck, pptxDeck]}
        lessons={lessons}
        liveDeckIds={[pptxId]}
        state={{}}
        formAction={() => {}}
        pending={false}
      />,
    );
    const chip = row("Queues workshop").getByText("Live");
    expect(chip.closest("[data-status]")?.getAttribute("data-status")).toBe("live");
    expect(chip.parentElement?.contains(screen.getByRole("link", { name: "Queues workshop" }))).toBe(true);
    expect(row("Brokers in practice").queryByText("Live")).toBeNull();
    expect(container.querySelectorAll('[data-status="live"]')).toHaveLength(1);
  });

  it("shows no Live chip without a session", () => {
    const { container } = renderList([readyDeck, pendingDeck, pptxDeck]);
    expect(container.querySelector('[data-status="live"]')).toBeNull();
    expect(screen.queryByText("Live")).toBeNull();
  });
});
