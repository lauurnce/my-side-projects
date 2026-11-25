import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import type { ClassOutline } from "@/lib/routes";
import { minutesLabel, moduleNumber, moveLabel, outlineCountLabel, publishLabel, statusWord } from "./labels";
import { OutlineList } from "./OutlineList";

afterEach(cleanup);

const classId = "3f2b8c1e-6a4d-4e5f-9b7a-1c2d3e4f5a6b";
const weekOne = "11111111-1111-4111-8111-111111111111";
const weekTwo = "22222222-2222-4222-8222-222222222222";
const brokers = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const queues = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

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

const emptyOutline: ClassOutline = { classId, modules: [] };

function renderOutline(shown: ClassOutline = outline, pending = false) {
  return render(<OutlineList outline={shown} state={{}} formAction={() => {}} pending={pending} />);
}

function button(name: string) {
  return screen.getByRole("button", { name }) as HTMLButtonElement;
}

function hiddenValues(element: HTMLElement): Record<string, string> {
  const inputs = element.closest("form")!.querySelectorAll<HTMLInputElement>('input[type="hidden"]');
  return Object.fromEntries([...inputs].map((input) => [input.name, input.value]));
}

describe("outline labels", () => {
  it("numbers modules with two digits", () => {
    expect([moduleNumber(0), moduleNumber(8), moduleNumber(29)]).toEqual(["Module 01", "Module 09", "Module 30"]);
  });

  it("names what each button acts on", () => {
    expect(moveLabel("Week 1", "up")).toBe("Move up: Week 1");
    expect(moveLabel("Week 1", "down")).toBe("Move down: Week 1");
    expect(publishLabel("Message brokers", false)).toBe("Publish Message brokers");
    expect(publishLabel("Message brokers", true)).toBe("Unpublish Message brokers");
  });

  it("writes the status, the minutes and the counts as words", () => {
    expect([statusWord(true), statusWord(false)]).toEqual(["Published", "Draft"]);
    expect(minutesLabel(12)).toBe("12 min");
    expect(outlineCountLabel(outline)).toBe("2 modules, 2 lessons");
    expect(outlineCountLabel({ classId, modules: [{ ...outline.modules[1], lessons: [outline.modules[0].lessons[0]] }] })).toBe(
      "1 module, 1 lesson",
    );
  });
});

describe("OutlineList", () => {
  it("has the heading and the count label", () => {
    renderOutline();
    expect(screen.getByRole("heading", { level: 2, name: "Modules and lessons" })).toBeTruthy();
    expect(screen.getByText("2 modules, 2 lessons")).toBeTruthy();
  });

  it("lists modules in order with their position labels", () => {
    renderOutline();
    const titles = screen.getAllByRole("heading", { level: 3 }).map((heading) => heading.textContent);
    expect(titles).toEqual(["Week 1", "Week 2"]);
    expect(screen.getByText("Module 01")).toBeTruthy();
    expect(screen.getByText("Module 02")).toBeTruthy();
  });

  it("lists lessons in order as links to the reader, with an edit link", () => {
    renderOutline();
    const list = screen.getByRole("list", { name: "Lessons in Week 1" });
    const rows = within(list).getAllByRole("listitem");
    expect(rows.map((row) => within(row).getAllByRole("link")[0].textContent)).toEqual(["Message brokers", "Queues"]);

    const reader = screen.getByRole("link", { name: "Message brokers" }) as HTMLAnchorElement;
    const editor = screen.getByRole("link", { name: "Edit Message brokers" }) as HTMLAnchorElement;
    expect(reader.getAttribute("href")).toBe(`/classes/${classId}/lessons/${brokers}`);
    expect(editor.getAttribute("href")).toBe(`/classes/${classId}/lessons/${brokers}/edit`);
  });

  it("says Published or Draft in words and never uses the gold chips", () => {
    renderOutline();
    const rows = within(screen.getByRole("list", { name: "Lessons in Week 1" })).getAllByRole("listitem");
    const chips = rows.map((row) => row.querySelector("[data-status]")!);
    expect(chips.map((chip) => chip.textContent)).toEqual(["Published", "Draft"]);
    expect(chips.map((chip) => chip.getAttribute("data-status"))).toEqual(["submitted", "due"]);
    expect(within(rows[0]).getByText("12 min")).toBeTruthy();
  });

  it("offers Unpublish for a published lesson and Publish for a draft", () => {
    renderOutline();
    expect(hiddenValues(button("Unpublish Message brokers"))).toEqual({
      intent: "setLessonPublished",
      lessonId: brokers,
      published: "false",
    });
    expect(hiddenValues(button("Publish Queues"))).toEqual({
      intent: "setLessonPublished",
      lessonId: queues,
      published: "true",
    });
  });

  it("disables the move buttons at the edges only", () => {
    renderOutline();
    expect(button("Move up: Week 1").disabled).toBe(true);
    expect(button("Move down: Week 1").disabled).toBe(false);
    expect(button("Move up: Week 2").disabled).toBe(false);
    expect(button("Move down: Week 2").disabled).toBe(true);
    expect(button("Move up: Message brokers").disabled).toBe(true);
    expect(button("Move down: Message brokers").disabled).toBe(false);
    expect(button("Move up: Queues").disabled).toBe(false);
    expect(button("Move down: Queues").disabled).toBe(true);
  });

  it("posts each control with its intent and the id it acts on", () => {
    renderOutline();
    expect(hiddenValues(button("Move up: Week 2"))).toEqual({ intent: "moveModule", moduleId: weekTwo, direction: "up" });
    expect(hiddenValues(button("Move up: Queues"))).toEqual({ intent: "moveLesson", lessonId: queues, direction: "up" });
    expect(hiddenValues(button("Delete module Week 2"))).toEqual({ intent: "deleteModule", moduleId: weekTwo });
    expect(hiddenValues(button("Delete lesson Message brokers"))).toEqual({ intent: "deleteLesson", lessonId: brokers });
    expect(hiddenValues(button("Save title of Week 1"))).toEqual({ intent: "renameModule", moduleId: weekOne });
    expect(hiddenValues(button("Add lesson to Week 2"))).toEqual({ intent: "addLesson", moduleId: weekTwo });
    expect(hiddenValues(button("Add module"))).toEqual({ intent: "addModule", classId });
  });

  it("uses submit buttons inside forms so it works without scripts", () => {
    renderOutline();
    for (const control of screen.getAllByRole("button") as HTMLButtonElement[]) {
      expect(control.type).toBe("submit");
      expect(control.closest("form")).not.toBeNull();
    }
  });

  it("labels the title fields and limits their length", () => {
    renderOutline();
    const rename = screen.getByLabelText("Module title for Week 1") as HTMLInputElement;
    const addLesson = screen.getByLabelText("New lesson title in Week 1") as HTMLInputElement;
    const addModule = screen.getByLabelText("New module title") as HTMLInputElement;
    expect([rename.name, rename.value, rename.maxLength, rename.required]).toEqual(["title", "Week 1", 120, true]);
    expect([addLesson.name, addLesson.value, addLesson.maxLength, addLesson.required]).toEqual(["title", "", 160, true]);
    expect([addModule.name, addModule.maxLength, addModule.required]).toEqual(["title", 120, true]);
  });

  it("shows honest empty states", () => {
    renderOutline();
    expect(screen.getByText("No lessons in this module yet.")).toBeTruthy();
    cleanup();

    renderOutline(emptyOutline);
    expect(screen.getByText("No modules yet. Add the first module.")).toBeTruthy();
    expect(screen.getByText("0 modules, 0 lessons")).toBeTruthy();
    expect(screen.queryAllByRole("heading", { level: 3 })).toEqual([]);
    expect(button("Add module").disabled).toBe(false);
  });

  it("shows the last result as a status or an alert", () => {
    const { rerender } = render(
      <OutlineList outline={outline} state={{ tone: "status", message: "Moved" }} formAction={() => {}} pending={false} />,
    );
    expect(screen.getByRole("status").textContent).toBe("Moved");
    expect(screen.queryByRole("alert")).toBeNull();

    rerender(
      <OutlineList
        outline={outline}
        state={{ tone: "alert", message: "A class can have 30 modules at most." }}
        formAction={() => {}}
        pending={false}
      />,
    );
    expect(screen.getByRole("alert").textContent).toBe("A class can have 30 modules at most.");
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("disables every button while an action is pending", () => {
    renderOutline(outline, true);
    expect((screen.getAllByRole("button") as HTMLButtonElement[]).every((control) => control.disabled)).toBe(true);
  });

  it("renders a title with markup as text", () => {
    const risky = { ...outline.modules[1], title: "<img src=x onerror=alert(1)>" };
    const { container } = renderOutline({ classId, modules: [risky] });
    expect(screen.getByRole("heading", { level: 3 }).textContent).toBe("<img src=x onerror=alert(1)>");
    expect(container.querySelector("img")).toBeNull();
  });
});
