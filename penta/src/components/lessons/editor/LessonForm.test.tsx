import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import type { OutlineState, SaveLessonState } from "@/app/classes/routes-schema";
import type { LessonDetail } from "@/lib/routes";
import { characterCountLabel, LessonForm } from "./LessonForm";
import { PreviewBoundary } from "./PreviewBoundary";
import { PublishControl } from "./PublishControl";

afterEach(cleanup);

const lesson: LessonDetail = {
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  classId: "3f2b8c1e-6a4d-4e5f-9b7a-1c2d3e4f5a6b",
  moduleId: "11111111-1111-4111-8111-111111111111",
  moduleTitle: "Week 1",
  title: "Message brokers",
  bodyMd: "Hello **world**",
  estMinutes: 12,
  published: false,
  revision: 4,
};

function renderForm(result: SaveLessonState = {}) {
  const saveAction = vi.fn(async () => result);
  const view = render(<LessonForm lesson={lesson} saveAction={saveAction} />);
  return { ...view, saveAction };
}

function bodyField() {
  return screen.getByLabelText("Body") as HTMLTextAreaElement;
}

function preview() {
  return screen.getByRole("region", { name: "Preview" });
}

async function type(text: string) {
  await act(async () => {
    fireEvent.change(bodyField(), { target: { value: text } });
  });
}

async function save() {
  await act(async () => {
    fireEvent.submit(bodyField().closest("form")!);
  });
}

describe("characterCountLabel", () => {
  it("counts against the limit and says when it is over", () => {
    expect(characterCountLabel(0)).toBe("0 of 50,000 characters");
    expect(characterCountLabel(50000)).toBe("50,000 of 50,000 characters");
    expect(characterCountLabel(50001)).toBe("50,001 of 50,000 characters. Too long to save.");
  });
});

describe("LessonForm", () => {
  it("wires each label to its field with the lesson values", () => {
    renderForm();
    const title = screen.getByLabelText("Title") as HTMLInputElement;
    const minutes = screen.getByLabelText("Minutes to read") as HTMLInputElement;
    const body = bodyField();
    expect([title.name, title.value, title.maxLength, title.required]).toEqual(["title", "Message brokers", 160, true]);
    expect([minutes.name, minutes.value, minutes.type, minutes.min, minutes.max]).toEqual([
      "minutes",
      "12",
      "number",
      "1",
      "600",
    ]);
    expect([body.name, body.value, body.tagName]).toEqual(["body", "Hello **world**", "TEXTAREA"]);
    expect(body.rows).toBeGreaterThanOrEqual(20);
    expect(body.getAttribute("spellcheck")).toBe("true");
    expect(body.hasAttribute("maxlength")).toBe(false);
  });

  it("sends the lesson id and the revision it was loaded with", () => {
    const { container } = renderForm();
    const hidden = container.querySelectorAll<HTMLInputElement>('form input[type="hidden"]');
    expect(Object.fromEntries([...hidden].map((input) => [input.name, input.value]))).toMatchObject({
      lessonId: lesson.id,
      revision: "4",
    });
  });

  it("describes the body with the visible hint and a live character count", async () => {
    renderForm();
    const described = bodyField()
      .getAttribute("aria-describedby")!
      .split(" ")
      .map((id) => document.getElementById(id)?.textContent);
    expect(described).toEqual([
      "Markdown. Headings, lists, links, quotes and code. Images and raw HTML are not shown.",
      "15 of 50,000 characters",
    ]);

    await type("abc");
    expect(screen.getByText("3 of 50,000 characters")).toBeTruthy();
    await type("a".repeat(50001));
    expect(screen.getByText("50,001 of 50,000 characters. Too long to save.")).toBeTruthy();
    expect(bodyField().value.length).toBe(50001);
  });

  it("previews the typed text as rendered markdown", async () => {
    renderForm();
    expect(within(preview()).getByText("world").tagName).toBe("STRONG");
    expect(screen.getByRole("heading", { level: 2, name: "Preview" })).toBeTruthy();

    await type("# Big idea\n\n- one\n- two");
    expect((await within(preview()).findByRole("heading", { name: "Big idea" })).tagName).toBe("H2");
    expect(within(preview()).getAllByRole("listitem").map((item) => item.textContent)).toEqual(["one", "two"]);
    expect(within(preview()).queryByText("world")).toBeNull();
  });

  it("shows a typed script tag as text and creates no script element", async () => {
    const { container } = renderForm();
    await type("<script>window.hacked = true</script>\n\n<img src=x onerror=alert(1)>");
    expect(await within(preview()).findByText(/<script>window\.hacked = true<\/script>/)).toBeTruthy();
    expect(container.querySelector("script")).toBeNull();
    expect(container.querySelector("img")).toBeNull();
    expect((window as unknown as { hacked?: boolean }).hacked).toBeUndefined();
  });

  it("says so when there is nothing to preview", async () => {
    renderForm();
    await type("   ");
    expect(await within(preview()).findByText("Nothing to preview yet. Write in the body field.")).toBeTruthy();
  });

  it("submits the fields to the action and shows Saved as a status with the new revision", async () => {
    const { saveAction, container } = renderForm({
      tone: "status",
      message: "Saved",
      revision: 5,
      values: { title: "Message brokers", minutes: "12", body: "Hello **world**" },
    });
    await save();
    const sent = (saveAction.mock.calls[0] as unknown as [SaveLessonState, FormData])[1];
    expect(Object.fromEntries(sent)).toMatchObject({
      lessonId: lesson.id,
      revision: "4",
      title: "Message brokers",
      minutes: "12",
      body: "Hello **world**",
    });
    expect(screen.getByRole("status").textContent).toBe("Saved");
    expect(container.querySelector<HTMLInputElement>('input[name="revision"]')!.value).toBe("5");

    await type("Hello **world** again");
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("keeps the text and shows an alert when the lesson changed elsewhere", async () => {
    const conflict = "This lesson was changed in another tab, or it no longer exists. Copy your text, then reload.";
    const longBody = "kept ".repeat(8000);
    const { container } = renderForm({
      tone: "alert",
      message: conflict,
      revision: 4,
      values: { title: "My title", minutes: "30", body: longBody },
    });
    await type(longBody);
    await save();
    expect(screen.getByRole("alert").textContent).toBe(conflict);
    expect(bodyField().value).toBe(longBody);
    expect((screen.getByLabelText("Title") as HTMLInputElement).value).toBe("My title");
    expect((screen.getByLabelText("Minutes to read") as HTMLInputElement).value).toBe("30");
    expect(container.querySelector<HTMLInputElement>('input[name="revision"]')!.value).toBe("4");
  });

  it("ties each field error to its field", async () => {
    renderForm({
      tone: "alert",
      message: "Check the marked fields, then save again.",
      revision: 4,
      fieldErrors: {
        title: "Enter a lesson title",
        minutes: "Enter at least 1 minute",
        body: "Use 50,000 characters or fewer",
      },
      values: { title: "", minutes: "0", body: "Hello **world**" },
    });
    await save();
    const expected: [string, string][] = [
      ["Title", "Error: Enter a lesson title"],
      ["Minutes to read", "Error: Enter at least 1 minute"],
      ["Body", "Error: Use 50,000 characters or fewer"],
    ];
    for (const [label, message] of expected) {
      const field = screen.getByLabelText(label, { exact: false });
      const described = field
        .getAttribute("aria-describedby")!
        .split(" ")
        .map((id) => document.getElementById(id)?.textContent);
      expect(field.getAttribute("aria-invalid")).toBe("true");
      expect(described).toContain(message);
    }
    expect(screen.getByRole("alert").textContent).toBe("Check the marked fields, then save again.");
  });

  it("has an enabled Save button", () => {
    renderForm();
    const button = screen.getByRole("button", { name: "Save" }) as HTMLButtonElement;
    expect([button.type, button.disabled]).toEqual(["submit", false]);
  });
});

describe("PreviewBoundary", () => {
  function Broken({ text }: { text: string }): never {
    throw new Error(text);
  }

  it("shows a calm message when the preview throws and recovers when the text changes", () => {
    const quiet = vi.spyOn(console, "error").mockImplementation(() => {});
    const { rerender } = render(
      <PreviewBoundary text="bad">
        <Broken text="bad" />
      </PreviewBoundary>,
    );
    expect(screen.getByRole("alert").textContent).toBe("The preview could not be shown. Your text is safe.");

    rerender(
      <PreviewBoundary text="good">
        <p>fine again</p>
      </PreviewBoundary>,
    );
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByText("fine again")).toBeTruthy();
    quiet.mockRestore();
  });
});

describe("PublishControl", () => {
  function renderControl(published: boolean, result: OutlineState = {}) {
    const action = vi.fn(async () => result);
    const view = render(
      <PublishControl lessonId={lesson.id} title={lesson.title} published={published} action={action} />,
    );
    return { ...view, action };
  }

  function hiddenValues(container: HTMLElement) {
    const inputs = container.querySelectorAll<HTMLInputElement>('input[type="hidden"]');
    return Object.fromEntries([...inputs].map((input) => [input.name, input.value]));
  }

  it("shows Draft with a Publish button", () => {
    const { container } = renderControl(false);
    expect(container.querySelector("[data-status]")!.textContent).toBe("Draft");
    expect(container.querySelector("[data-status]")!.getAttribute("data-status")).toBe("due");
    expect(screen.getByRole("button", { name: "Publish Message brokers" }).textContent).toBe("Publish");
    expect(hiddenValues(container)).toEqual({ intent: "setLessonPublished", lessonId: lesson.id, published: "true" });
  });

  it("shows Published with an Unpublish button", () => {
    const { container } = renderControl(true);
    expect(container.querySelector("[data-status]")!.textContent).toBe("Published");
    expect(screen.getByRole("button", { name: "Unpublish Message brokers" }).textContent).toBe("Unpublish");
    expect(hiddenValues(container)).toEqual({ intent: "setLessonPublished", lessonId: lesson.id, published: "false" });
  });

  it("shows the result of the action", async () => {
    const { container } = renderControl(false, {
      tone: "status",
      message: "Lesson published. Students can read it now.",
    });
    await act(async () => {
      fireEvent.submit(container.querySelector("form")!);
    });
    expect(screen.getByRole("status").textContent).toBe("Lesson published. Students can read it now.");
  });
});
