import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { idleLessonDoneState } from "@/app/classes/lesson-messages";
import type { DeckSummary } from "@/lib/decks";
import type { LessonDetail, OutlineLesson } from "@/lib/routes";
import { ReaderView, type ReaderViewProps } from "./ReaderView";

afterEach(cleanup);

const classId = "7b0f6a52-1c1d-4f6e-9d55-0d6d3a1f2c11";
const lessonId = "0f3f8e0a-52a7-4b6c-8a44-6f0b0f0f9d22";
const previousId = "1a2b3c4d-52a7-4b6c-8a44-6f0b0f0f9d33";
const nextId = "9z8y7x6w-52a7-4b6c-8a44-6f0b0f0f9d44";

const lesson: LessonDetail = {
  id: lessonId,
  classId,
  moduleId: "m1",
  moduleTitle: "Integration basics",
  title: "Message queues",
  bodyMd: "A queue holds work until a worker is free.",
  estMinutes: 8,
  published: true,
  revision: 1,
};

function neighbour(id: string, title: string): OutlineLesson {
  return { id, moduleId: "m1", title, estMinutes: 5, published: true, done: false };
}

function deck(id: string, title: string, viewedCount: number): DeckSummary {
  return { id, classId, lessonId, title, kind: "pdf", slideCount: 24, sizeBytes: 9, ready: true, viewedCount };
}

const idle = async () => idleLessonDoneState;

function view(overrides: Partial<ReaderViewProps> = {}) {
  return (
    <ReaderView
      lesson={lesson}
      isOwner={false}
      done={false}
      place={{ position: 2, total: 5 }}
      previous={neighbour(previousId, "Why integrate")}
      next={neighbour(nextId, "Retries")}
      progress={{ done: 3, published: 5 }}
      decks={[]}
      action={idle}
      {...overrides}
    />
  );
}

function hiddenValue(container: HTMLElement, name: string) {
  return container.querySelector<HTMLInputElement>(`input[type="hidden"][name="${name}"]`)?.value;
}

describe("ReaderView", () => {
  it("shows one h1, the labels and the body", () => {
    render(view());
    const headings = screen.getAllByRole("heading", { level: 1 });
    expect(headings).toHaveLength(1);
    expect(headings[0].textContent).toBe("Message queues");
    expect(screen.getByText("Integration basics")).toBeTruthy();
    expect(screen.getByText("8 min read")).toBeTruthy();
    expect(screen.getByText("Lesson 2 of 5")).toBeTruthy();
    expect(screen.getByText("A queue holds work until a worker is free.")).toBeTruthy();
    expect(screen.getAllByRole("link", { name: "Back to the class" })[0].getAttribute("href")).toBe(
      `/classes/${classId}`,
    );
  });

  it("keeps markdown headings below the page title", () => {
    render(view({ lesson: { ...lesson, bodyMd: "# Inside the body" } }));
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.getByRole("heading", { level: 2 }).textContent).toBe("Inside the body");
  });

  it("shows a script tag in the body as text", () => {
    const { container } = render(view({ lesson: { ...lesson, bodyMd: "<script>alert(1)</script>" } }));
    expect(container.textContent).toContain("<script>alert(1)</script>");
    expect(document.querySelector("script")).toBeNull();
  });

  it("says so when the body is empty", () => {
    render(view({ lesson: { ...lesson, bodyMd: "  \n" } }));
    expect(screen.getByText("This lesson has no text yet.")).toBeTruthy();
  });

  it("offers Mark as done to a student who has not finished", () => {
    const { container } = render(view());
    expect(screen.getByRole("button", { name: "Mark as done" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Mark as not done" })).toBeNull();
    expect(screen.queryByText("Done")).toBeNull();
    expect(container.querySelectorAll("form")).toHaveLength(1);
    expect(hiddenValue(container, "lessonId")).toBe(lessonId);
    expect(hiddenValue(container, "done")).toBe("true");
    expect(screen.getByText("3 of 5 lessons done")).toBeTruthy();
    expect(screen.getByRole("status").textContent).toBe("");
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("shows the Done chip and the undo button when finished", () => {
    const { container } = render(view({ done: true }));
    expect(screen.getByText("Done").getAttribute("data-status")).toBe("graded");
    expect(screen.getByRole("button", { name: "Mark as not done" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Mark as done" })).toBeNull();
    expect(container.querySelectorAll("form")).toHaveLength(1);
    expect(hiddenValue(container, "done")).toBe("false");
  });

  it("shows the owner a preview notice with the edit link and no done controls", () => {
    const { container } = render(view({ isOwner: true }));
    expect(screen.getByText("Preview. Students see this lesson.")).toBeTruthy();
    expect(screen.getByText("Published").getAttribute("data-status")).toBe("submitted");
    expect(screen.getByRole("link", { name: "Edit lesson" }).getAttribute("href")).toBe(
      `/classes/${classId}/lessons/${lessonId}/edit`,
    );
    expect(screen.queryByRole("button")).toBeNull();
    expect(container.querySelector("form")).toBeNull();
    expect(screen.queryByText(/lessons done/)).toBeNull();
  });

  it("shows the owner a draft notice and only the back link", () => {
    render(
      view({
        isOwner: true,
        lesson: { ...lesson, published: false },
        place: null,
        previous: null,
        next: null,
      }),
    );
    expect(screen.getByText("Draft. Students cannot see this lesson yet.")).toBeTruthy();
    expect(screen.getByText("Draft").getAttribute("data-status")).toBe("due");
    expect(screen.getByRole("link", { name: "Edit lesson" })).toBeTruthy();
    expect(screen.queryByText(/Lesson \d+ of \d+/)).toBeNull();
    expect(screen.queryByRole("button")).toBeNull();
    const links = within(screen.getByRole("navigation", { name: "Lessons" })).getAllByRole("link");
    expect(links.map((link) => link.textContent)).toEqual(["Back to the class"]);
  });

  it("shows nothing about slides when the lesson has no deck", () => {
    render(view());
    expect(screen.queryByText("Slides for this lesson")).toBeNull();
    expect(screen.queryByRole("region", { name: "Slides for this lesson" })).toBeNull();
  });

  it("shows the decks of the lesson under the body", () => {
    render(view({ decks: [deck("d1", "Queues in pictures", 6), deck("d2", "Broker tour", 0)] }));
    const block = screen.getByRole("region", { name: "Slides for this lesson" });
    const links = within(block).getAllByRole("link");
    expect(links.map((link) => link.getAttribute("href"))).toEqual(["/decks/d1", "/decks/d2"]);
    expect(links[0].textContent).toContain("Queues in pictures");
    expect(links[0].textContent).toContain("24 slides · PDF");
    expect(links[0].textContent).toContain("Viewed 6 / 24");
    const body = screen.getByText("A queue holds work until a worker is free.");
    expect(body.compareDocumentPosition(block) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const progress = screen.getByRole("region", { name: "Your progress" });
    expect(block.compareDocumentPosition(progress) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
  });

  it("shows the decks to the owner who previews the lesson", () => {
    render(view({ isOwner: true, decks: [deck("d1", "Queues in pictures", 0)] }));
    const block = screen.getByRole("region", { name: "Slides for this lesson" });
    expect(within(block).getByRole("link").getAttribute("href")).toBe("/decks/d1");
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("never uses the gold chips", () => {
    const { container } = render(view({ isOwner: true, lesson: { ...lesson, published: false } }));
    expect(container.querySelector('[data-status="late"], [data-status="live"]')).toBeNull();
    cleanup();
    const student = render(view({ done: true }));
    expect(student.container.querySelector('[data-status="late"], [data-status="live"]')).toBeNull();
  });

  it("links to the previous and next lessons", () => {
    render(view());
    const nav = within(screen.getByRole("navigation", { name: "Lessons" }));
    const links = nav.getAllByRole("link");
    expect(links.map((link) => link.getAttribute("href"))).toEqual([
      `/classes/${classId}/lessons/${previousId}`,
      `/classes/${classId}/lessons/${nextId}`,
    ]);
    expect(links[0].textContent).toBe("PreviousWhy integrate");
    expect(links[1].textContent).toBe("NextRetries");
    expect(nav.queryByText("Back to the class")).toBeNull();
  });

  it("shows nothing on the side with no neighbour", () => {
    render(view({ previous: null, place: { position: 1, total: 5 } }));
    const nav = within(screen.getByRole("navigation", { name: "Lessons" }));
    expect(nav.queryByText("Previous")).toBeNull();
    expect(nav.getAllByRole("link")).toHaveLength(1);
  });

  it("ends the last lesson with a link back to the class", () => {
    render(view({ next: null, place: { position: 5, total: 5 } }));
    const nav = within(screen.getByRole("navigation", { name: "Lessons" }));
    expect(nav.queryByText("Next")).toBeNull();
    expect(nav.getByRole("link", { name: "Back to the class" }).getAttribute("href")).toBe(`/classes/${classId}`);
    expect(nav.getByText("Previous")).toBeTruthy();
  });
});
