import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { DeckDetail } from "@/lib/decks";
import { noLive } from "@/lib/live";
import { DeckViewer, type DeckViewerProps } from "../DeckViewer";

const fake = vi.hoisted(() => ({
  numPages: 5,
  opens: [] as Record<string, unknown>[],
  rendered: [] as number[],
  cleaned: [] as number[],
  destroyed: 0,
  failOpen: false,
  recordSlideView: vi.fn<(input: unknown) => Promise<unknown>>(),
  refreshDeckSource: vi.fn<(input: unknown) => Promise<unknown>>(),
}));

vi.mock("@/lib/pdf-client", () => {
  class PDFDataRangeTransport {
    length: number;
    constructor(length: number) {
      this.length = length;
    }
    onDataRange() {}
  }

  function page(number: number) {
    return {
      getViewport: ({ scale }: { scale: number }) => ({ width: 960 * scale, height: 540 * scale }),
      render: () => {
        fake.rendered.push(number);
        return { promise: Promise.resolve(), cancel: () => undefined };
      },
      cleanup: () => {
        fake.cleaned.push(number);
        return true;
      },
      getTextContent: async () => ({
        items: number === 2 ? [] : [{ str: `Topic  ${number}`, hasEOL: true }, { str: "Second line", hasEOL: false }],
      }),
    };
  }

  const pdfjs = {
    PDFDataRangeTransport,
    AnnotationMode: { DISABLE: 0 },
    getDocument: (options: Record<string, unknown>) => {
      fake.opens.push(options);
      const promise = fake.failOpen
        ? Promise.reject(new Error("broken"))
        : Promise.resolve({ numPages: fake.numPages, getPage: async (number: number) => page(number) });
      promise.catch(() => undefined);
      return {
        promise,
        destroy: async () => {
          fake.destroyed += 1;
        },
      };
    },
  };

  return {
    documentOptions: { isEvalSupported: false, enableXfa: false, stopAtErrors: true },
    loadPdfjs: async () => pdfjs,
  };
});

vi.mock("@/app/decks/view-actions", () => ({
  refreshDeckSource: (input: unknown) => fake.refreshDeckSource(input),
}));

vi.mock("@/lib/supabase/client", () => {
  const noSession = { session_id: null, current_slide: null, revision: 0, running: false };
  const client = {
    from: () => ({
      upsert: async (row: { deck_id: string; slide_no: number }) => {
        const result = (await fake.recordSlideView({ deckId: row.deck_id, slideNo: row.slide_no })) as { ok: boolean };
        return { error: result.ok ? null : { code: "42501" } };
      },
    }),
    rpc: async () => ({ data: noSession, error: null }),
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

const deckId = "7b0f6a52-1c1d-4f6e-9d55-0d6d3a1f2c11";
const classId = "0f3f8e0a-52a7-4b6c-8a44-6f0b0f0f9d22";

const deck: DeckDetail = {
  id: deckId,
  classId,
  lessonId: null,
  title: "Message queues",
  kind: "pptx",
  slideCount: 5,
  sizeBytes: 300000,
  ready: true,
  viewedCount: 2,
  pdfPath: "class/deck/slides.pdf",
  originalPath: "class/deck/slides.pptx",
};

const source = { url: "https://storage.test/signed", length: 300000 };

function view(overrides: Partial<DeckViewerProps> = {}) {
  return (
    <DeckViewer
      deck={deck}
      source={source}
      viewedSlides={[1, 2]}
      recordsViews
      viewer={{ id: "student-1", isOwner: false }}
      initialLive={noLive}
      {...overrides}
    />
  );
}

function region() {
  return screen.getByRole("group", { name: "Slides of Message queues" });
}

async function painted(slide: number) {
  await waitFor(() => expect(screen.queryByText(`Loading slide ${slide}`)).toBeNull());
  await waitFor(() => expect(fake.rendered).toContain(slide));
}

beforeEach(() => {
  fake.numPages = 5;
  fake.opens = [];
  fake.rendered = [];
  fake.cleaned = [];
  fake.destroyed = 0;
  fake.failOpen = false;
  fake.recordSlideView.mockReset().mockResolvedValue({ ok: true });
  fake.refreshDeckSource.mockReset().mockResolvedValue(null);
  vi.stubGlobal("ResizeObserver", InstantResizeObserver);
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("DeckViewer", () => {
  it("shows the header, the class link and the download link", async () => {
    render(view());
    expect(screen.getByRole("heading", { level: 1, name: "Message queues" })).toBeTruthy();
    expect(screen.getAllByRole("heading")).toHaveLength(1);
    expect(screen.getByRole("link", { name: "Back to the class" }).getAttribute("href")).toBe(`/classes/${classId}`);
    expect(screen.getByRole("link", { name: "Download PPTX" }).getAttribute("href")).toBe(`/decks/${deckId}/download`);
    expect(screen.getByText("Layer 02 · Decks")).toBeTruthy();
    await painted(1);
  });

  it("names the PDF download for a PDF deck", async () => {
    render(view({ deck: { ...deck, kind: "pdf", originalPath: null } }));
    expect(screen.getByRole("link", { name: "Download PDF" })).toBeTruthy();
    await painted(1);
  });

  it("opens the file through the ranged transport", async () => {
    render(view());
    await painted(1);
    const options = fake.opens.at(-1);
    expect(options).toMatchObject({
      disableAutoFetch: true,
      disableStream: true,
      rangeChunkSize: 262144,
      isEvalSupported: false,
      enableXfa: false,
      stopAtErrors: true,
    });
    expect(options?.url).toBeUndefined();
    expect(options?.data).toBeUndefined();
    expect((options?.range as { length: number }).length).toBe(300000);
  });

  it("shows a loading text, then the counter and one marker per slide", async () => {
    render(view());
    expect(screen.getByText("Loading slide 1")).toBeTruthy();
    await painted(1);
    expect(screen.getByText("Slide 1 / 5")).toBeTruthy();
    expect(screen.getByText("Viewed 2 / 5")).toBeTruthy();

    const markers = within(screen.getByRole("group", { name: "Slides" })).getAllByRole("button");
    expect(markers).toHaveLength(5);
    expect(markers.map((marker) => marker.getAttribute("aria-label"))).toEqual([
      "Slide 1, viewed",
      "Slide 2, viewed",
      "Slide 3",
      "Slide 4",
      "Slide 5",
    ]);
    expect(markers.map((marker) => marker.getAttribute("data-state"))).toEqual([
      "current",
      "viewed",
      "idle",
      "idle",
      "idle",
    ]);
    expect(markers.map((marker) => marker.getAttribute("aria-current"))).toEqual(["true", null, null, null, null]);
    expect(markers.map((marker) => marker.tabIndex)).toEqual([0, -1, -1, -1, -1]);
  });

  it("keeps one hidden canvas and no text layer", async () => {
    const { container } = render(view());
    await painted(1);
    const canvases = container.querySelectorAll("canvas");
    expect(canvases).toHaveLength(1);
    expect(canvases[0].getAttribute("aria-hidden")).toBe("true");
    expect(canvases[0].width).toBe(960);
    expect(canvases[0].height).toBe(540);

    fireEvent.click(screen.getByRole("button", { name: "Next slide" }));
    await painted(2);
    expect(container.querySelector("canvas")).toBe(canvases[0]);
    expect(fake.cleaned).toContain(1);
  });

  it("moves with the buttons and disables them at the ends", async () => {
    render(view());
    await painted(1);
    const previous = screen.getByRole("button", { name: "Previous slide" }) as HTMLButtonElement;
    const next = screen.getByRole("button", { name: "Next slide" }) as HTMLButtonElement;
    expect(previous.disabled).toBe(true);
    expect(next.disabled).toBe(false);

    fireEvent.click(next);
    expect(screen.getByText("Slide 2 / 5")).toBeTruthy();
    expect(previous.disabled).toBe(false);
    fireEvent.click(previous);
    expect(screen.getByText("Slide 1 / 5")).toBeTruthy();

    fireEvent.keyDown(region(), { key: "End" });
    expect(screen.getByText("Slide 5 / 5")).toBeTruthy();
    expect(next.disabled).toBe(true);
    await painted(5);
  });

  it("moves with the keys on the viewer region", async () => {
    render(view());
    await painted(1);
    const viewer = region();
    expect(viewer.tabIndex).toBe(0);
    expect(viewer.getAttribute("aria-roledescription")).toBe("slide deck");

    fireEvent.keyDown(viewer, { key: "ArrowRight" });
    expect(screen.getByText("Slide 2 / 5")).toBeTruthy();
    fireEvent.keyDown(viewer, { key: "PageDown" });
    expect(screen.getByText("Slide 3 / 5")).toBeTruthy();
    fireEvent.keyDown(viewer, { key: "ArrowLeft" });
    expect(screen.getByText("Slide 2 / 5")).toBeTruthy();
    fireEvent.keyDown(viewer, { key: "PageUp" });
    expect(screen.getByText("Slide 1 / 5")).toBeTruthy();
    fireEvent.keyDown(viewer, { key: "ArrowLeft" });
    expect(screen.getByText("Slide 1 / 5")).toBeTruthy();
    fireEvent.keyDown(viewer, { key: "End" });
    expect(screen.getByText("Slide 5 / 5")).toBeTruthy();
    fireEvent.keyDown(viewer, { key: "Home" });
    expect(screen.getByText("Slide 1 / 5")).toBeTruthy();
    await painted(1);
  });

  it("ignores keys with a modifier and keys pressed on the window", async () => {
    render(view());
    await painted(1);
    fireEvent.keyDown(region(), { key: "ArrowRight", altKey: true });
    fireEvent.keyDown(region(), { key: "ArrowRight", metaKey: true });
    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(screen.getByText("Slide 1 / 5")).toBeTruthy();
  });

  it("selects a slide from its marker and moves focus along the strip", async () => {
    render(view());
    await painted(1);
    const third = screen.getByRole("button", { name: "Slide 3" });
    third.focus();
    fireEvent.click(third);
    expect(screen.getByText("Slide 3 / 5")).toBeTruthy();
    expect(third.getAttribute("aria-current")).toBe("true");

    fireEvent.keyDown(third, { key: "ArrowRight" });
    const fourth = screen.getByRole("button", { name: "Slide 4" });
    expect(fourth.getAttribute("aria-current")).toBe("true");
    expect(document.activeElement).toBe(fourth);
    await painted(4);
  });

  it("swipes on a touch screen only", async () => {
    const { container } = render(view());
    await painted(1);
    const stage = container.querySelector("canvas")?.parentElement?.parentElement as HTMLElement;

    fireEvent.pointerDown(stage, { pointerType: "touch", clientX: 300, clientY: 100 });
    fireEvent.pointerUp(stage, { pointerType: "touch", clientX: 180, clientY: 110 });
    expect(screen.getByText("Slide 2 / 5")).toBeTruthy();

    fireEvent.pointerDown(stage, { pointerType: "touch", clientX: 180, clientY: 100 });
    fireEvent.pointerUp(stage, { pointerType: "touch", clientX: 300, clientY: 100 });
    expect(screen.getByText("Slide 1 / 5")).toBeTruthy();

    fireEvent.pointerDown(stage, { pointerType: "mouse", clientX: 300, clientY: 100 });
    fireEvent.pointerUp(stage, { pointerType: "mouse", clientX: 100, clientY: 100 });
    expect(screen.getByText("Slide 1 / 5")).toBeTruthy();
    await painted(1);
  });

  it("announces the position and the slide text in one polite region", async () => {
    const { container } = render(view());
    const live = container.querySelectorAll("[aria-live]");
    expect(live).toHaveLength(1);
    expect(live[0].getAttribute("aria-live")).toBe("polite");
    expect(live[0].getAttribute("aria-atomic")).toBe("true");
    expect(live[0].className).toBe("visually-hidden");

    await waitFor(() => expect(live[0].textContent).toBe("Slide 1 of 5. Topic 1\nSecond line"));
    fireEvent.click(screen.getByRole("button", { name: "Next slide" }));
    await waitFor(() =>
      expect(live[0].textContent).toBe("Slide 2 of 5. No readable text on this slide. Download the file to read it."),
    );
    await painted(2);
  });

  it("navigates by the real page count and never records above the stored count", async () => {
    fake.numPages = 7;
    render(view({ deck: { ...deck, slideCount: 5 }, viewedSlides: [] }));
    await painted(1);
    expect(screen.getByText("Slide 1 / 7")).toBeTruthy();
    expect(screen.getByText("Viewed 0 / 5")).toBeTruthy();

    fireEvent.keyDown(region(), { key: "End" });
    await painted(7);
    await new Promise((resolve) => setTimeout(resolve, 1200));
    expect(fake.recordSlideView).not.toHaveBeenCalledWith({ deckId, slideNo: 7 });
  });

  it("records a slide a student stays on and updates the count at once", async () => {
    render(view({ viewedSlides: [1, 2] }));
    await painted(1);
    fireEvent.keyDown(region(), { key: "ArrowRight" });
    fireEvent.keyDown(region(), { key: "ArrowRight" });
    await painted(3);
    await waitFor(() => expect(screen.getByText("Viewed 3 / 5")).toBeTruthy(), { timeout: 2500 });
    expect(fake.recordSlideView).toHaveBeenCalledTimes(1);
    expect(fake.recordSlideView).toHaveBeenCalledWith({ deckId, slideNo: 3 });
    expect(screen.getByRole("button", { name: "Slide 3, viewed" })).toBeTruthy();
  });

  it("shows a teacher the same viewer with no viewed line and no recording", async () => {
    render(view({ recordsViews: false, viewedSlides: [] }));
    await painted(1);
    expect(screen.getByText("Slide 1 / 5")).toBeTruthy();
    expect(screen.queryByText(/Viewed/)).toBeNull();
    await new Promise((resolve) => setTimeout(resolve, 1200));
    expect(fake.recordSlideView).not.toHaveBeenCalled();
  });

  it("says so when the file could not be signed and keeps the download link", () => {
    const { container } = render(view({ source: null }));
    expect(screen.getByText("This deck is not available right now. Try again in a moment.")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Download PPTX" })).toBeTruthy();
    expect(container.querySelector("canvas")).toBeNull();
    expect(fake.opens).toHaveLength(0);
  });

  it("offers a reload when the deck cannot be opened and asks the server for a fresh address", async () => {
    fake.failOpen = true;
    render(view());
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("This deck could not be loaded. Reload the deck.");

    fake.failOpen = false;
    fake.refreshDeckSource.mockResolvedValue({ url: "https://storage.test/fresh", length: 300000 });
    fireEvent.click(within(alert).getByRole("button", { name: "Reload" }));
    await painted(1);
    expect(fake.refreshDeckSource).toHaveBeenCalledWith({ deckId });
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("keeps the failure when the reload gets no fresh address", async () => {
    fake.failOpen = true;
    render(view());
    fireEvent.click(within(await screen.findByRole("alert")).getByRole("button", { name: "Reload" }));
    await waitFor(() => expect(fake.refreshDeckSource).toHaveBeenCalled());
    expect(await screen.findByRole("alert")).toBeTruthy();
  });

  it("destroys the document on unmount and clears the canvas", async () => {
    const { container, unmount } = render(view());
    await painted(1);
    const canvas = container.querySelector("canvas") as HTMLCanvasElement;
    unmount();
    expect(fake.destroyed).toBe(1);
    expect(canvas.width).toBe(0);
    expect(canvas.height).toBe(0);
  });
});
