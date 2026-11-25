import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import {
  settingsValues,
  type QuizActionState,
  type SaveQuestionState,
  type SaveSettingsState,
} from "@/app/ops/builder-schema";
import type { Activity, TeacherQuestion } from "@/lib/quiz";
import { hasKey, pointsLabel, pointsSummary, shownAnswers, shownOptions } from "./labels";
import { QuestionBoard } from "./QuestionBoard";
import { QuestionCard } from "./QuestionCard";
import { QuizActions } from "./QuizActions";
import { SettingsForm } from "./SettingsForm";

afterEach(cleanup);

const activityId = "11111111-1111-4111-8111-111111111111";
const deckId = "33333333-3333-4333-8333-333333333333";
const lessonId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

const mcq: TeacherQuestion = {
  id: "22222222-2222-4222-8222-222222222221",
  kind: "mcq",
  prompt: "Which one is a message broker?",
  options: ["Postgres", "RabbitMQ", "Nginx"],
  points: 2,
  position: 1,
  key: 1,
};

const tf: TeacherQuestion = {
  id: "22222222-2222-4222-8222-222222222222",
  kind: "tf",
  prompt: "A queue keeps messages in order.",
  options: null,
  points: 1,
  position: 2,
  key: false,
};

const ident: TeacherQuestion = {
  id: "22222222-2222-4222-8222-222222222223",
  kind: "ident",
  prompt: "Name the pattern with publishers and subscribers.",
  options: null,
  points: 3,
  position: 3,
  key: ["pub sub", "publish subscribe"],
};

const activity: Activity = {
  id: activityId,
  classId: "3f2b8c1e-6a4d-4e5f-9b7a-1c2d3e4f5a6b",
  lessonId,
  type: "quiz",
  title: "Quiz 1",
  instructionsMd: "Read **each** item.",
  points: 6,
  dueAt: "2026-11-30T15:59:00.000Z",
  publishedAt: null,
  requiresDeckId: deckId,
  attemptLimit: 2,
  timeLimitMin: 20,
  showAnswers: "after_due",
};

function hiddenValues(form: HTMLFormElement) {
  const inputs = form.querySelectorAll<HTMLInputElement>('input[type="hidden"]');
  return Object.fromEntries([...inputs].map((input) => [input.name, input.value]));
}

function describedTexts(field: HTMLElement) {
  return (field.getAttribute("aria-describedby") ?? "")
    .split(" ")
    .filter(Boolean)
    .map((id) => document.getElementById(id)?.textContent);
}

function renderBoard(
  questions: TeacherQuestion[],
  published: boolean,
  results: { save?: SaveQuestionState; list?: QuizActionState; rekey?: QuizActionState } = {},
) {
  const saveAction = vi.fn(async () => results.save ?? {});
  const listAction = vi.fn(async () => results.list ?? {});
  const rekeyAction = vi.fn(async () => results.rekey ?? {});
  const view = render(
    <QuestionBoard
      activityId={activityId}
      questions={questions}
      published={published}
      saveAction={saveAction}
      listAction={listAction}
      rekeyAction={rekeyAction}
    />,
  );
  return { ...view, saveAction, listAction, rekeyAction };
}

function group(container: HTMLElement, kind: string) {
  return container.querySelector<HTMLElement>(`[data-kind="${kind}"]`)!;
}

function questionIdField() {
  const form = screen.getByRole("button", { name: "Save question" }).closest("form")!;
  return form.querySelector<HTMLInputElement>('input[name="questionId"]')!;
}

function sentForm(action: ReturnType<typeof vi.fn>) {
  return (action.mock.calls[0] as unknown as [unknown, FormData])[1];
}

describe("labels", () => {
  it("counts points and questions in plain words", () => {
    expect(pointsSummary(12, 5)).toBe("12 points, 5 questions");
    expect(pointsSummary(1, 1)).toBe("1 point, 1 question");
    expect(pointsSummary(0, 0)).toBe("0 points, 0 questions");
    expect(pointsLabel(1)).toBe("1 point");
  });

  it("marks the right option for each kind", () => {
    expect(shownOptions(mcq)).toEqual([
      { text: "Postgres", correct: false },
      { text: "RabbitMQ", correct: true },
      { text: "Nginx", correct: false },
    ]);
    expect(shownOptions(tf)).toEqual([
      { text: "True", correct: false },
      { text: "False", correct: true },
    ]);
    expect(shownOptions({ ...tf, key: true })[0].correct).toBe(true);
    expect(shownOptions(ident)).toEqual([]);
    expect(shownAnswers(ident)).toEqual(["pub sub", "publish subscribe"]);
    expect(shownAnswers(mcq)).toEqual([]);
  });

  it("knows when a key is missing", () => {
    expect([hasKey(mcq), hasKey(tf), hasKey(ident)]).toEqual([true, true, true]);
    expect([hasKey({ ...mcq, key: null }), hasKey({ ...tf, key: null }), hasKey({ ...ident, key: null })]).toEqual([
      false,
      false,
      false,
    ]);
  });
});

describe("QuestionCard", () => {
  it("shows a multiple choice with the right option marked by the word Correct", () => {
    render(<QuestionCard question={mcq} index={0} />);
    expect(screen.getByText("Question 1")).toBeTruthy();
    expect(screen.getByText("Multiple choice")).toBeTruthy();
    expect(screen.getByText("2 points")).toBeTruthy();
    expect(screen.getByText("Which one is a message broker?")).toBeTruthy();
    const items = screen.getAllByRole("listitem");
    expect(items.map((item) => item.textContent)).toEqual(["Postgres", "RabbitMQCorrect", "Nginx"]);
    expect(within(items[1]).getByText("Correct").tagName).toBe("STRONG");
    expect(screen.getAllByText("Correct")).toHaveLength(1);
  });

  it("shows a true or false question with the right answer marked", () => {
    render(<QuestionCard question={tf} index={1} />);
    expect(screen.getByText("Question 2")).toBeTruthy();
    expect(screen.getByText("True or false")).toBeTruthy();
    expect(screen.getByText("1 point")).toBeTruthy();
    expect(screen.getAllByRole("listitem").map((item) => item.textContent)).toEqual(["True", "FalseCorrect"]);
  });

  it("shows the accepted answers of an identification question", () => {
    render(<QuestionCard question={ident} index={2} />);
    expect(screen.getByText("Identification")).toBeTruthy();
    expect(screen.getByText("Accepted answers")).toBeTruthy();
    expect(screen.getAllByRole("listitem").map((item) => item.textContent)).toEqual(["pub sub", "publish subscribe"]);
    expect(screen.queryByText("Correct")).toBeNull();
  });

  it("renders the prompt and options as text", () => {
    const markup = '<img src=x onerror="alert(1)">';
    const { container } = render(
      <QuestionCard question={{ ...mcq, prompt: markup, options: [markup, "<b>bold</b>"], key: 0 }} index={0} />,
    );
    expect(screen.getAllByText(markup)).toHaveLength(2);
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("b")).toBeNull();
  });

  it("says so when a question has no key", () => {
    render(<QuestionCard question={{ ...mcq, key: null }} index={0} />);
    expect(screen.getByText("No answer key is saved for this one. Edit it and save it again.")).toBeTruthy();
    expect(screen.queryByText("Correct")).toBeNull();
  });
});

describe("QuestionBoard as a draft", () => {
  it("lists the questions in order with edit, move and delete controls", () => {
    renderBoard([mcq, tf, ident], false);
    expect(screen.getByRole("heading", { level: 2, name: "Questions" })).toBeTruthy();
    expect(screen.getByText("3 questions")).toBeTruthy();
    expect(screen.getByText("Question 1")).toBeTruthy();
    expect(screen.getByText("Question 3")).toBeTruthy();
    for (const number of [1, 2, 3]) {
      expect(screen.getByRole("button", { name: `Edit item ${number}` }).textContent).toBe("Edit");
      expect(screen.getByRole("button", { name: `Delete item ${number}` }).textContent).toBe("Delete");
    }
    const up = (number: number) => screen.getByRole("button", { name: `Move up: item ${number}` }) as HTMLButtonElement;
    const down = (number: number) =>
      screen.getByRole("button", { name: `Move down: item ${number}` }) as HTMLButtonElement;
    expect([up(1).disabled, up(2).disabled, down(2).disabled, down(3).disabled]).toEqual([true, false, false, true]);
    expect(screen.queryByText("This quiz is published. Unpublish it to change questions.")).toBeNull();
    expect(screen.queryByRole("button", { name: /Change the key/ })).toBeNull();
  });

  it("sends the move and delete forms with their intent", () => {
    renderBoard([mcq, tf], false);
    const down = screen.getByRole("button", { name: "Move down: item 1" }).closest("form")!;
    const remove = screen.getByRole("button", { name: "Delete item 2" }).closest("form")!;
    expect(hiddenValues(down)).toEqual({ intent: "moveQuestion", questionId: mcq.id, direction: "down" });
    expect(hiddenValues(remove)).toEqual({ intent: "deleteQuestion", questionId: tf.id });
  });

  it("shows the result of a list action", async () => {
    renderBoard([mcq, tf], false, { list: { tone: "status", message: "Question deleted" } });
    await act(async () => {
      fireEvent.submit(screen.getByRole("button", { name: "Delete item 2" }).closest("form")!);
    });
    expect(screen.getByRole("status").textContent).toBe("Question deleted");
  });

  it("has an empty state and an empty question form ready", () => {
    renderBoard([], false);
    expect(screen.getByText("No questions yet. Add the first one.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Add question" })).toBeTruthy();
    expect(screen.getByRole("heading", { level: 3, name: "New question" })).toBeTruthy();
    expect((screen.getByLabelText("Question") as HTMLTextAreaElement).value).toBe("");
    expect((screen.getByLabelText("Points") as HTMLInputElement).value).toBe("1");
    expect((screen.getByLabelText("Kind") as HTMLSelectElement).value).toBe("mcq");
    const save = screen.getByRole("button", { name: "Save question" }) as HTMLButtonElement;
    expect([save.type, save.disabled]).toEqual(["submit", false]);
  });

  it("offers the three kinds by name", () => {
    renderBoard([], false);
    const kind = screen.getByLabelText("Kind") as HTMLSelectElement;
    expect([kind.name, kind.tagName]).toEqual(["kind", "SELECT"]);
    expect([...kind.options].map((option) => [option.value, option.textContent])).toEqual([
      ["mcq", "Multiple choice"],
      ["tf", "True or false"],
      ["ident", "Identification"],
    ]);
  });

  it("renders all three answer groups and shows the one for the chosen kind", () => {
    const { container } = renderBoard([], false);
    expect([group(container, "mcq").hidden, group(container, "tf").hidden, group(container, "ident").hidden]).toEqual([
      false,
      true,
      true,
    ]);
    for (const row of [1, 2, 3, 4, 5, 6]) {
      const option = screen.getByLabelText(`Option ${row}`) as HTMLInputElement;
      const correct = screen.getByLabelText(`Correct option ${row}`) as HTMLInputElement;
      expect([option.name, option.maxLength]).toEqual([`option${row}`, 300]);
      expect([correct.type, correct.name, correct.value, correct.checked]).toEqual([
        "radio",
        "correctOption",
        String(row),
        false,
      ]);
    }
    expect(screen.getAllByText("Correct option")).toHaveLength(6);

    fireEvent.change(screen.getByLabelText("Kind"), { target: { value: "tf" } });
    expect([group(container, "mcq").hidden, group(container, "tf").hidden, group(container, "ident").hidden]).toEqual([
      true,
      false,
      true,
    ]);
    const truth = screen.getByRole("group", { name: "Right answer" });
    const yes = within(truth).getByLabelText("True") as HTMLInputElement;
    const no = within(truth).getByLabelText("False") as HTMLInputElement;
    expect([yes.type, yes.name, yes.value, no.value]).toEqual(["radio", "truth", "true", "false"]);

    fireEvent.change(screen.getByLabelText("Kind"), { target: { value: "ident" } });
    expect(group(container, "ident").hidden).toBe(false);
    const accepted = screen.getByLabelText("Accepted answers") as HTMLTextAreaElement;
    expect([accepted.name, accepted.tagName]).toEqual(["accepted", "TEXTAREA"]);
    expect(describedTexts(accepted)).toEqual(["One per line. Capital letters and extra spaces are ignored."]);
  });

  it("shows every group before the page is interactive so the form works without scripts", () => {
    const markup = renderToString(
      <QuestionBoard
        activityId={activityId}
        questions={[]}
        published={false}
        saveAction={async () => ({})}
        listAction={async () => ({})}
        rekeyAction={async () => ({})}
      />,
    );
    const page = document.createElement("div");
    page.innerHTML = markup;
    expect(["mcq", "tf", "ident"].map((kind) => group(page, kind).hidden)).toEqual([false, false, false]);
    expect(page.querySelector('textarea[name="prompt"]')).toBeTruthy();
    expect(page.querySelector('textarea[name="accepted"]')).toBeTruthy();
    expect(page.querySelectorAll('input[name="truth"]')).toHaveLength(2);
  });

  it("sends every field of a new question to the save action", async () => {
    const { saveAction } = renderBoard([mcq], false, { save: { tone: "status", message: "Question saved" } });
    fireEvent.change(screen.getByLabelText("Question"), { target: { value: "Pick the broker" } });
    fireEvent.change(screen.getByLabelText("Points"), { target: { value: "4" } });
    fireEvent.change(screen.getByLabelText("Option 1"), { target: { value: "Kafka" } });
    fireEvent.change(screen.getByLabelText("Option 2"), { target: { value: "SQLite" } });
    fireEvent.click(screen.getByLabelText("Correct option 1"));
    await act(async () => {
      fireEvent.submit(screen.getByRole("button", { name: "Save question" }).closest("form")!);
    });
    expect(Object.fromEntries(sentForm(saveAction))).toMatchObject({
      activityId,
      questionId: "",
      kind: "mcq",
      prompt: "Pick the broker",
      points: "4",
      option1: "Kafka",
      option2: "SQLite",
      option3: "",
      correctOption: "1",
      accepted: "",
    });
    expect(screen.getByRole("status").textContent).toBe("Question saved");
  });

  it("loads a question into the form when Edit is pressed", () => {
    const { container } = renderBoard([mcq, tf, ident], false);
    expect(questionIdField().value).toBe("");
    fireEvent.click(screen.getByRole("button", { name: "Edit item 1" }));
    expect(screen.getByRole("heading", { level: 3, name: "Edit question 1" })).toBeTruthy();
    expect((screen.getByLabelText("Question") as HTMLTextAreaElement).value).toBe(mcq.prompt);
    expect((screen.getByLabelText("Points") as HTMLInputElement).value).toBe("2");
    expect((screen.getByLabelText("Option 2") as HTMLInputElement).value).toBe("RabbitMQ");
    expect((screen.getByLabelText("Option 4") as HTMLInputElement).value).toBe("");
    expect((screen.getByLabelText("Correct option 2") as HTMLInputElement).checked).toBe(true);
    expect(questionIdField().value).toBe(mcq.id);

    fireEvent.click(screen.getByRole("button", { name: "Edit item 2" }));
    expect((screen.getByLabelText("Kind") as HTMLSelectElement).value).toBe("tf");
    expect((screen.getByLabelText("False") as HTMLInputElement).checked).toBe(true);
    expect(group(container, "tf").hidden).toBe(false);

    fireEvent.click(screen.getByRole("button", { name: "Edit item 3" }));
    expect((screen.getByLabelText("Kind") as HTMLSelectElement).value).toBe("ident");
    expect((screen.getByLabelText("Accepted answers") as HTMLTextAreaElement).value).toBe("pub sub\npublish subscribe");

    fireEvent.click(screen.getByRole("button", { name: "Add question" }));
    expect(screen.getByRole("heading", { level: 3, name: "New question" })).toBeTruthy();
    expect((screen.getByLabelText("Question") as HTMLTextAreaElement).value).toBe("");
    expect(questionIdField().value).toBe("");
  });

  it("goes back to an empty form after an edit is saved", async () => {
    renderBoard([mcq, tf], false, { save: { tone: "status", message: "Question saved" } });
    fireEvent.click(screen.getByRole("button", { name: "Edit item 2" }));
    await act(async () => {
      fireEvent.submit(screen.getByRole("button", { name: "Save question" }).closest("form")!);
    });
    expect(screen.getByRole("heading", { level: 3, name: "New question" })).toBeTruthy();
    expect((screen.getByLabelText("Question") as HTMLTextAreaElement).value).toBe("");
    expect(screen.getByRole("status").textContent).toBe("Question saved");
  });

  it("keeps the typed values and ties the errors to their fields when a save fails", async () => {
    renderBoard([mcq], false, {
      save: {
        tone: "alert",
        message: "Check the marked fields, then save again.",
        fieldErrors: { prompt: "Enter the question", points: "Enter a whole number from 1 to 100" },
        values: {
          kind: "ident",
          prompt: " ",
          points: "0",
          options: ["", "", "", "", "", ""],
          correctOption: "",
          truth: "",
          accepted: "kept answer",
        },
      },
    });
    fireEvent.change(screen.getByLabelText("Kind"), { target: { value: "ident" } });
    await act(async () => {
      fireEvent.submit(screen.getByRole("button", { name: "Save question" }).closest("form")!);
    });
    expect(screen.getByRole("alert").textContent).toBe("Check the marked fields, then save again.");
    const prompt = screen.getByLabelText("Question", { exact: false });
    const points = screen.getByLabelText("Points", { exact: false });
    expect([prompt.getAttribute("aria-invalid"), points.getAttribute("aria-invalid")]).toEqual(["true", "true"]);
    expect(describedTexts(prompt)).toContain("Error: Enter the question");
    expect(describedTexts(points)).toContain("Error: Enter a whole number from 1 to 100");
    expect((screen.getByLabelText("Kind") as HTMLSelectElement).value).toBe("ident");
    expect((screen.getByLabelText("Accepted answers", { exact: false }) as HTMLTextAreaElement).value).toBe(
      "kept answer",
    );
  });
});

describe("QuestionBoard when published", () => {
  it("replaces the question form with one line and offers a key change per question", () => {
    renderBoard([mcq, tf, ident], true);
    expect(screen.getByText("This quiz is published. Unpublish it to change questions.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Add question" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Save question" })).toBeNull();
    expect(screen.queryByLabelText("Question")).toBeNull();
    expect(screen.queryByLabelText("Kind")).toBeNull();
    expect(screen.queryByRole("button", { name: /^Edit item/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /^Delete item/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /^Move item/ })).toBeNull();
    expect(screen.getAllByText("Changing a key regrades every submitted attempt.")).toHaveLength(3);
    for (const number of [1, 2, 3]) {
      expect(screen.getByRole("button", { name: `Change the key of item ${number}` }).textContent).toBe(
        "Change the key",
      );
    }
  });

  it("fills each key form with the saved key", () => {
    renderBoard([mcq, tf, ident], true);
    const forms = [1, 2, 3].map(
      (number) => screen.getByRole("button", { name: `Change the key of item ${number}` }).closest("form")!,
    );
    expect(hiddenValues(forms[0])).toEqual({ questionId: mcq.id, kind: "mcq" });
    const choices = within(within(forms[0]).getByRole("group", { name: "Correct option" })).getAllByRole(
      "radio",
    ) as HTMLInputElement[];
    expect(choices.map((choice) => [choice.name, choice.value, choice.checked])).toEqual([
      ["correctOption", "1", false],
      ["correctOption", "2", true],
      ["correctOption", "3", false],
    ]);
    expect(within(forms[0]).getByLabelText("RabbitMQ")).toBe(choices[1]);
    expect((within(forms[1]).getByLabelText("False") as HTMLInputElement).checked).toBe(true);
    expect((within(forms[1]).getByLabelText("True") as HTMLInputElement).checked).toBe(false);
    expect((within(forms[2]).getByLabelText("Accepted answers") as HTMLTextAreaElement).value).toBe(
      "pub sub\npublish subscribe",
    );
  });

  it("sends the new key and says how many attempts were regraded", async () => {
    const { rekeyAction } = renderBoard([mcq, tf], true, {
      rekey: { tone: "status", message: "Key changed. 12 attempts regraded." },
    });
    const form = screen.getByRole("button", { name: "Change the key of item 1" }).closest("form")!;
    fireEvent.click(within(form).getByLabelText("Nginx"));
    await act(async () => {
      fireEvent.submit(form);
    });
    expect(Object.fromEntries(sentForm(rekeyAction))).toEqual({ questionId: mcq.id, kind: "mcq", correctOption: "3" });
    expect(within(form).getByRole("status").textContent).toBe("Key changed. 12 attempts regraded.");
  });
});

describe("SettingsForm", () => {
  const decks = [{ id: deckId, title: "Week 1 slides" }];
  const lessons = [
    {
      moduleId: "m1",
      moduleTitle: "Week 1",
      lessons: [{ id: lessonId, label: "Message brokers (Draft)", published: false }],
    },
  ];

  function renderSettings(result: SaveSettingsState = {}, timeLimitLocked = false) {
    const action = vi.fn(async () => result);
    const view = render(
      <SettingsForm
        activityId={activityId}
        values={settingsValues(activity)}
        decks={decks}
        lessons={lessons}
        timeLimitLocked={timeLimitLocked}
        action={action}
      />,
    );
    return { ...view, action };
  }

  async function save() {
    await act(async () => {
      fireEvent.submit(screen.getByRole("button", { name: "Save settings" }).closest("form")!);
    });
  }

  it("is prefilled, with the due date shown as the Manila minute", () => {
    renderSettings();
    const title = screen.getByLabelText("Quiz title") as HTMLInputElement;
    const due = screen.getByLabelText("Due date") as HTMLInputElement;
    const attempts = screen.getByLabelText("Attempts allowed") as HTMLInputElement;
    const minutes = screen.getByLabelText("Time limit in minutes") as HTMLInputElement;
    const instructions = screen.getByLabelText("Instructions") as HTMLTextAreaElement;
    expect([title.name, title.value, title.maxLength, title.required]).toEqual(["title", "Quiz 1", 160, true]);
    expect([due.name, due.type, due.value]).toEqual(["dueAt", "datetime-local", "2026-11-30T23:59"]);
    expect([attempts.name, attempts.type, attempts.value, attempts.min, attempts.max]).toEqual([
      "attemptLimit",
      "number",
      "2",
      "1",
      "10",
    ]);
    expect([minutes.name, minutes.type, minutes.value, minutes.min, minutes.max, minutes.readOnly]).toEqual([
      "timeLimit",
      "number",
      "20",
      "1",
      "300",
      false,
    ]);
    expect([instructions.name, instructions.tagName, instructions.value]).toEqual([
      "instructions",
      "TEXTAREA",
      "Read **each** item.",
    ]);
  });

  it("offers the answer choices in plain words and the decks and lessons of the class", () => {
    renderSettings();
    const answers = screen.getByLabelText("Show answers") as HTMLSelectElement;
    const deck = screen.getByLabelText("Required deck") as HTMLSelectElement;
    const lesson = screen.getByLabelText("Linked lesson") as HTMLSelectElement;
    expect([answers.name, answers.value]).toEqual(["showAnswers", "after_due"]);
    expect([...answers.options].map((option) => [option.value, option.textContent])).toEqual([
      ["never", "Never"],
      ["after_submit", "Right after a student submits"],
      ["after_due", "After the due date"],
    ]);
    expect([deck.name, deck.value]).toEqual(["deckId", deckId]);
    expect([...deck.options].map((option) => option.textContent)).toEqual(["None", "Week 1 slides"]);
    expect([lesson.name, lesson.value]).toEqual(["lessonId", lessonId]);
    expect([...lesson.options].map((option) => option.textContent)).toEqual(["None", "Message brokers (Draft)"]);
    expect(lesson.querySelector("optgroup")!.label).toBe("Week 1");
  });

  it("ties each helper line to its field", () => {
    renderSettings();
    expect(describedTexts(screen.getByLabelText("Due date"))).toEqual(["Manila time. Closes at the minute you set."]);
    expect(describedTexts(screen.getByLabelText("Attempts allowed"))).toEqual([
      "With more than one attempt, a student can work out a short quiz by changing one answer at a time.",
    ]);
    expect(describedTexts(screen.getByLabelText("Show answers"))).toEqual([
      "Showing answers after the due date does not take them back if you move the date later.",
    ]);
  });

  it("locks the time limit once a student has started", () => {
    renderSettings({}, true);
    const minutes = screen.getByLabelText("Time limit in minutes") as HTMLInputElement;
    expect(minutes.readOnly).toBe(true);
    expect(describedTexts(minutes)).toEqual(["The time limit cannot change after a student has started."]);
  });

  it("sends every field with the quiz id and shows the saved status", async () => {
    const { action } = renderSettings({ tone: "status", message: "Settings saved" });
    await save();
    expect(Object.fromEntries(sentForm(action))).toEqual({
      activityId,
      title: "Quiz 1",
      dueAt: "2026-11-30T23:59",
      timeLimit: "20",
      attemptLimit: "2",
      showAnswers: "after_due",
      deckId,
      lessonId,
      instructions: "Read **each** item.",
    });
    expect(screen.getByRole("status").textContent).toBe("Settings saved");
  });

  it("keeps the typed values and ties each error to its field", async () => {
    renderSettings({
      tone: "alert",
      message: "Check the marked fields, then save again.",
      fieldErrors: {
        title: "Enter a quiz title",
        dueAt: "Enter a real date and time",
        showAnswers: "Showing answers right after submitting needs exactly one attempt.",
      },
      values: {
        title: "",
        instructions: "typed text",
        dueAt: "",
        attemptLimit: "3",
        timeLimit: "",
        showAnswers: "after_submit",
        deckId: "",
        lessonId: "",
      },
    });
    await save();
    expect(screen.getByRole("alert").textContent).toBe("Check the marked fields, then save again.");
    const expected: [string, string][] = [
      ["Quiz title", "Error: Enter a quiz title"],
      ["Due date", "Error: Enter a real date and time"],
      ["Show answers", "Error: Showing answers right after submitting needs exactly one attempt."],
    ];
    for (const [label, message] of expected) {
      const field = screen.getByLabelText(label, { exact: false });
      expect(field.getAttribute("aria-invalid")).toBe("true");
      expect(describedTexts(field)).toContain(message);
    }
    expect((screen.getByLabelText("Show answers") as HTMLSelectElement).value).toBe("after_submit");
    expect((screen.getByLabelText("Attempts allowed") as HTMLInputElement).value).toBe("3");
    expect((screen.getByLabelText("Instructions") as HTMLTextAreaElement).value).toBe("typed text");
    expect((screen.getByLabelText("Required deck") as HTMLSelectElement).value).toBe("");
  });
});

describe("QuizActions", () => {
  function renderActions(
    props: { published: boolean; hasAttempts: boolean; canClose: boolean },
    result: QuizActionState = {},
  ) {
    const action = vi.fn(async () => result);
    const view = render(<QuizActions activityId={activityId} {...props} action={action} />);
    return { ...view, action };
  }

  it("offers Publish quiz and Delete quiz for a draft", () => {
    renderActions({ published: false, hasAttempts: false, canClose: false });
    const publish = screen.getByRole("button", { name: "Publish quiz" });
    expect(hiddenValues(publish.closest("form")!)).toEqual({
      intent: "setQuizPublished",
      activityId,
      published: "true",
    });
    expect(screen.queryByRole("button", { name: "Unpublish" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Close quiz now" })).toBeNull();
    const remove = screen.getByText("Delete quiz").closest("form")!;
    expect(hiddenValues(remove)).toEqual({ intent: "deleteQuiz", activityId });
    expect(screen.getByText("This removes the quiz and all of its questions. It cannot be undone.")).toBeTruthy();
  });

  it("offers Unpublish and Close quiz now for an open published quiz with no attempts", () => {
    renderActions({ published: true, hasAttempts: false, canClose: true });
    expect(screen.queryByRole("button", { name: "Publish quiz" })).toBeNull();
    expect(hiddenValues(screen.getByRole("button", { name: "Unpublish" }).closest("form")!)).toEqual({
      intent: "setQuizPublished",
      activityId,
      published: "false",
    });
    expect(hiddenValues(screen.getByRole("button", { name: "Close quiz now" }).closest("form")!)).toEqual({
      intent: "closeQuizNow",
      activityId,
    });
  });

  it("hides Unpublish and Delete once students have started, and Close when it is past due", () => {
    renderActions({ published: true, hasAttempts: true, canClose: false });
    expect(screen.queryByRole("button", { name: "Unpublish" })).toBeNull();
    expect(screen.queryByText("Delete quiz")).toBeNull();
    expect(screen.queryByRole("button", { name: "Close quiz now" })).toBeNull();
    expect(
      screen.getByText("Students have started this quiz, so it cannot be unpublished or deleted. Close it instead."),
    ).toBeTruthy();
  });

  it("shows a refusal as an alert", async () => {
    renderActions(
      { published: false, hasAttempts: false, canClose: false },
      { tone: "alert", message: "Add at least one question before publishing." },
    );
    await act(async () => {
      fireEvent.submit(screen.getByRole("button", { name: "Publish quiz" }).closest("form")!);
    });
    expect(screen.getByRole("alert").textContent).toBe("Add at least one question before publishing.");
  });
});
