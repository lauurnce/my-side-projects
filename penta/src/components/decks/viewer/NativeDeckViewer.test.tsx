import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { DeckDetail } from "@/lib/decks";
import { noLive } from "@/lib/live";
import type { DeckContent } from "@/lib/slides/schema";
import { DeckViewer, type DeckViewerProps } from "../DeckViewer";

const fake = vi.hoisted(() => ({
  live: { session_id: null, current_slide: null, revision: 0, running: false } as Record<string, unknown>,
  views: [] as number[],
  refresh: vi.fn(),
  loadPdfjs: vi.fn(),
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: fake.refresh }) }));
vi.mock("@/lib/pdf-client", () => ({ documentOptions: {}, loadPdfjs: fake.loadPdfjs }));
vi.mock("@/app/decks/view-actions", () => ({ refreshDeckSource: async () => null }));
vi.mock("@/lib/supabase/client", () => {
  const client = {
    from: () => ({
      upsert: async (row: { slide_no: number }) => {
        fake.views.push(row.slide_no);
        return { error: null };
      },
    }),
    rpc: async () => ({ data: fake.live, error: null }),
    removeChannel: async () => "ok",
  };
  return { createClient: () => client };
});

class InstantResizeObserver {
  callback: ResizeObserverCallback;
  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
  }
  observe() {
    this.callback([{ contentRect: { width: 960, height: 540 } } as ResizeObserverEntry], this);
  }
  unobserve() {}
  disconnect() {}
}

const deck: DeckDetail = {
  id: "7b0f6a52-1c1d-4f6e-9d55-0d6d3a1f2c11",
  classId: "0f3f8e0a-52a7-4b6c-8a44-6f0b0f0f9d22",
  lessonId: null,
  title: "Message queues",
  kind: "native",
  slideCount: 3,
  sizeBytes: 2048,
  ready: true,
  viewedCount: 0,
  pdfPath: null,
  originalPath: null,
};

const content: DeckContent = {
  v: 1,
  slides: ["Producers", "Brokers", "Consumers"].map((text, index) => ({
    id: `slide00${index}`,
    blocks: [{ id: `title00${index}`, type: "title" as const, x: 120, y: 120, w: 1360, h: 200, text, tone: "ink" as const }],
  })),
};

function view(overrides: Partial<DeckViewerProps> = {}) {
  return (
    <DeckViewer
      deck={deck}
      source={null}
      content={content}
      contentVersion={4}
      viewedSlides={[]}
      recordsViews
      viewer={{ id: "student-1", isOwner: false }}
      initialLive={noLive}
      {...overrides}
    />
  );
}

beforeEach(() => {
  vi.stubGlobal("ResizeObserver", InstantResizeObserver);
  fake.live = { session_id: null, current_slide: null, revision: 0, running: false };
  fake.views = [];
  fake.refresh.mockClear();
  fake.loadPdfjs.mockClear();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("a deck made in the editor, in the viewer", () => {
  it("draws the first slide without loading the PDF reader", async () => {
    const { container } = render(view());
    await waitFor(() => expect(screen.getByText("Producers")).toBeTruthy());
    expect(screen.getByText("Slide 1 / 3")).toBeTruthy();
    expect(container.querySelector("canvas")).toBeNull();
    expect(fake.loadPdfjs).not.toHaveBeenCalled();
    expect(screen.queryByText(/not available/)).toBeNull();
    expect(screen.getByText("SLIDES")).toBeTruthy();
  });

  it("moves with the buttons and the keyboard and reads the slide text out", async () => {
    render(view());
    fireEvent.click(screen.getByRole("button", { name: "Next slide" }));
    await waitFor(() => expect(screen.getByText("Brokers")).toBeTruthy());
    expect(screen.queryByText("Producers")).toBeNull();
    fireEvent.keyDown(screen.getByRole("group", { name: "Slides of Message queues" }), { key: "ArrowRight" });
    await waitFor(() => expect(screen.getByText("Slide 3 / 3")).toBeTruthy());
    expect(screen.getByRole("button", { name: "Next slide" })).toHaveProperty("disabled", true);
    await waitFor(() => expect(document.querySelector('[aria-live="polite"]')?.textContent).toContain("Consumers"));
  });

  it("records a view of the slide a student stays on", async () => {
    vi.useFakeTimers();
    render(view());
    await vi.advanceTimersByTimeAsync(1500);
    vi.useRealTimers();
    expect(fake.views).toContain(1);
  });

  it("lets the teacher present at once and offers Edit and Export PDF", async () => {
    render(view({ viewer: { id: "teacher-1", isOwner: true }, recordsViews: false }));
    await waitFor(() => expect(screen.getByRole("button", { name: /present/i })).toHaveProperty("disabled", false));
    expect(screen.getByRole("link", { name: "Edit slides" }).getAttribute("href")).toBe(`/decks/${deck.id}/edit`);
    expect(screen.getByRole("link", { name: "Export PDF" }).getAttribute("href")).toBe(`/decks/${deck.id}/download`);
  });

  it("does not offer Edit to a student", () => {
    render(view());
    expect(screen.queryByRole("link", { name: "Edit slides" })).toBeNull();
  });

  it("asks for fresh content when the live state reports a newer version", async () => {
    render(view({ initialLive: { ...noLive, contentVersion: 5 } }));
    await waitFor(() => expect(fake.refresh).toHaveBeenCalled());
  });

  it("does not refresh while the version it shows is the latest", async () => {
    fake.live = { session_id: null, current_slide: null, revision: 0, running: false, content_version: 4 };
    render(view({ initialLive: { ...noLive, contentVersion: 4 } }));
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(fake.refresh).not.toHaveBeenCalled();
  });

  it("falls back to the last slide when fresh content has fewer slides", async () => {
    const shown = render(view());
    fireEvent.click(screen.getByRole("button", { name: "Next slide" }));
    fireEvent.click(screen.getByRole("button", { name: "Next slide" }));
    await waitFor(() => expect(screen.getByText("Slide 3 / 3")).toBeTruthy());
    shown.rerender(view({ content: { v: 1, slides: content.slides.slice(0, 2) }, contentVersion: 5 }));
    await waitFor(() => expect(screen.getByText("Slide 2 / 2")).toBeTruthy());
    expect(screen.getByText("Brokers")).toBeTruthy();
  });

  it("says the deck is not available when its content could not be read", () => {
    render(view({ content: null }));
    expect(screen.getByText(/not available right now/)).toBeTruthy();
  });
});
