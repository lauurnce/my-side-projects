import { describe, expect, it } from "vitest";
import type { Activity, TeacherQuestion } from "@/lib/quiz";
import {
  acceptedAnswers,
  badKeyMessage,
  buildQuestion,
  builderIntentSchema,
  createQuizSchema,
  deleteQuestionState,
  keyFromForm,
  moveQuestionSchema,
  moveQuestionState,
  questionFromForm,
  questionStatusMessage,
  questionValues,
  quizMessages,
  quizSettingsSchema,
  quizWriteErrorMessage,
  regradedMessage,
  rekeyState,
  rekeyTargetSchema,
  rekeyValue,
  saveQuestionState,
  saveQuestionTargetSchema,
  setQuizPublishedSchema,
  settingsErrorState,
  settingsFieldErrors,
  settingsFromForm,
  settingsValues,
  statusOf,
  titleErrorMessage,
  type QuestionValues,
  type SettingsValues,
} from "./builder-schema";

const classId = "3f2b8c1e-6a4d-4e5f-9b7a-1c2d3e4f5a6b";
const activityId = "11111111-1111-4111-8111-111111111111";
const questionId = "22222222-2222-4222-8222-222222222222";
const deckId = "33333333-3333-4333-8333-333333333333";
const lessonId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

const settings: SettingsValues = {
  title: "Quiz 1",
  instructions: "Read each item.",
  dueAt: "",
  attemptLimit: "1",
  timeLimit: "",
  showAnswers: "never",
  deckId: "",
  lessonId: "",
};

const question: QuestionValues = {
  kind: "mcq",
  prompt: "Which one is a message broker?",
  points: "2",
  options: ["RabbitMQ", "Postgres", "", "", "", ""],
  correctOption: "1",
  truth: "",
  accepted: "",
};

function parseSettings(changes: Partial<SettingsValues>) {
  return quizSettingsSchema.safeParse({ ...settings, ...changes });
}

function errorsOf(changes: Partial<SettingsValues>) {
  const parsed = parseSettings(changes);
  return parsed.success ? {} : settingsFieldErrors(parsed.error);
}

function form(fields: Record<string, string>): FormData {
  const formData = new FormData();
  for (const [name, value] of Object.entries(fields)) formData.set(name, value);
  return formData;
}

describe("time zone guard", () => {
  it("runs in UTC so a Manila conversion bug cannot hide", () => {
    expect(new Date().getTimezoneOffset()).toBe(0);
  });
});

describe("quiz settings", () => {
  it("accepts the defaults and reads empty fields as none", () => {
    expect(parseSettings({}).data).toEqual({
      title: "Quiz 1",
      instructions: "Read each item.",
      dueAt: null,
      attemptLimit: 1,
      timeLimit: null,
      showAnswers: "never",
      deckId: null,
      lessonId: null,
    });
  });

  it("checks the title", () => {
    expect(parseSettings({ title: "  Midterm  " }).data?.title).toBe("Midterm");
    expect(errorsOf({ title: "   " })).toEqual({ title: "Enter a quiz title" });
    expect(errorsOf({ title: "a".repeat(161) })).toEqual({ title: "Use 160 characters or fewer" });
    expect(errorsOf({ title: "Quiz‮1" })).toEqual({ title: "Remove hidden or control characters" });
    expect(parseSettings({ title: "a".repeat(160) }).success).toBe(true);
  });

  it("normalizes line endings in the instructions and checks the length", () => {
    expect(parseSettings({ instructions: "one\r\ntwo\rthree\nfour" }).data?.instructions).toBe("one\ntwo\nthree\nfour");
    expect(parseSettings({ instructions: "" }).data?.instructions).toBe("");
    expect(parseSettings({ instructions: "a\r\n".repeat(5000) }).success).toBe(true);
    expect(errorsOf({ instructions: "a".repeat(10001) })).toEqual({ instructions: "Use 10,000 characters or fewer" });
    expect(errorsOf({ instructions: "bad\u0007bell" })).toEqual({
      instructions: "Remove hidden or control characters",
    });
  });

  it("reads the due date as a Manila minute and gives it back unchanged", () => {
    const parsed = parseSettings({ dueAt: "2026-11-30T17:00" });
    expect(parsed.data?.dueAt).toBe("2026-11-30T09:00:00.000Z");
    expect(settingsValues({ ...baseActivity, dueAt: parsed.data?.dueAt ?? null }).dueAt).toBe("2026-11-30T17:00");
    expect(parseSettings({ dueAt: "2026-01-01T00:30" }).data?.dueAt).toBe("2025-12-31T16:30:00.000Z");
  });

  it("refuses a date that does not exist", () => {
    for (const dueAt of ["2026-02-30T10:00", "2026-13-01T10:00", "tomorrow", "2026-11-30", "2026-11-30T25:00"]) {
      expect(errorsOf({ dueAt })).toEqual({ dueAt: "Enter a real date and time" });
    }
  });

  it("checks the attempts allowed", () => {
    expect(parseSettings({ attemptLimit: "10" }).data?.attemptLimit).toBe(10);
    for (const attemptLimit of ["", "0", "11", "1.5", "-1", "two", "1e1"]) {
      expect(errorsOf({ attemptLimit })).toEqual({ attemptLimit: "Enter a whole number from 1 to 10" });
    }
  });

  it("checks the time limit", () => {
    expect(parseSettings({ timeLimit: "300" }).data?.timeLimit).toBe(300);
    expect(parseSettings({ timeLimit: " 45 " }).data?.timeLimit).toBe(45);
    for (const timeLimit of ["0", "301", "2.5", "-5", "soon"]) {
      expect(errorsOf({ timeLimit })).toEqual({ timeLimit: "Enter 1 to 300 minutes, or leave it empty" });
    }
  });

  it("checks the show answers choice", () => {
    expect(errorsOf({ showAnswers: "always" })).toEqual({ showAnswers: "Choose when to show answers" });
    expect(errorsOf({ showAnswers: "" })).toEqual({ showAnswers: "Choose when to show answers" });
  });

  it("checks the deck and the lesson", () => {
    expect(parseSettings({ deckId, lessonId }).data).toMatchObject({ deckId, lessonId });
    expect(errorsOf({ deckId: "deck" })).toEqual({ deckId: "Choose one from the list" });
    expect(errorsOf({ lessonId: "lesson" })).toEqual({ lessonId: "Choose one from the list" });
  });

  it("needs exactly one attempt to show answers right after submitting", () => {
    expect(parseSettings({ showAnswers: "after_submit", attemptLimit: "1" }).success).toBe(true);
    expect(errorsOf({ showAnswers: "after_submit", attemptLimit: "2" })).toEqual({
      showAnswers: "Showing answers right after submitting needs exactly one attempt.",
    });
  });

  it("needs a due date to show answers after the due date", () => {
    expect(parseSettings({ showAnswers: "after_due", dueAt: "2026-11-30T17:00" }).success).toBe(true);
    expect(errorsOf({ showAnswers: "after_due", dueAt: "" })).toEqual({
      showAnswers: "Showing answers after the due date needs a due date.",
    });
  });

  it("reports every bad field at once", () => {
    expect(errorsOf({ title: "", attemptLimit: "0", timeLimit: "999", dueAt: "never" })).toEqual({
      title: "Enter a quiz title",
      attemptLimit: "Enter a whole number from 1 to 10",
      timeLimit: "Enter 1 to 300 minutes, or leave it empty",
      dueAt: "Enter a real date and time",
    });
  });
});

const baseActivity: Activity = {
  id: activityId,
  classId,
  lessonId,
  type: "quiz",
  title: "Quiz 1",
  instructionsMd: "Read each item.",
  points: 12,
  dueAt: "2026-11-30T15:59:30.000Z",
  publishedAt: null,
  requiresDeckId: deckId,
  attemptLimit: 3,
  timeLimitMin: 20,
  showAnswers: "after_due",
};

describe("settings form values", () => {
  it("fills the form from an activity with the due date as the Manila minute", () => {
    expect(settingsValues(baseActivity)).toEqual({
      title: "Quiz 1",
      instructions: "Read each item.",
      dueAt: "2026-11-30T23:59",
      attemptLimit: "3",
      timeLimit: "20",
      showAnswers: "after_due",
      deckId,
      lessonId,
    });
  });

  it("leaves the optional fields empty", () => {
    const values = settingsValues({ ...baseActivity, dueAt: null, timeLimitMin: null, requiresDeckId: null, lessonId: null });
    expect([values.dueAt, values.timeLimit, values.deckId, values.lessonId]).toEqual(["", "", "", ""]);
  });

  it("reads the posted fields as text and normalizes line endings", () => {
    const formData = form({ ...settings, instructions: "one\r\ntwo" });
    formData.delete("deckId");
    expect(settingsFromForm(formData)).toEqual({ ...settings, instructions: "one\ntwo" });
    const withFile = form(settings);
    withFile.set("title", new Blob(["x"]));
    expect(settingsFromForm(withFile).title).toBe("");
  });
});

describe("settings database refusals", () => {
  function refusal(message: string) {
    return settingsErrorState({ code: "23514", message });
  }

  it("puts each named refusal on its field", () => {
    const expected: [string, object][] = [
      [
        'new row for relation "activities" violates check constraint "activities_after_submit_single_attempt"',
        { showAnswers: "Showing answers right after submitting needs exactly one attempt." },
      ],
      [
        'new row for relation "activities" violates check constraint "activities_after_due_needs_due"',
        { showAnswers: "Showing answers after the due date needs a due date." },
      ],
      ["activity_has_attempts", { timeLimit: "The time limit cannot change after a student has started." }],
      ["activity_deck_outside_class", { deckId: "That deck is not ready or is not in this class." }],
      ["activity_lesson_outside_class", { lessonId: "That lesson is not in this class." }],
    ];
    for (const [message, fieldErrors] of expected) {
      expect(refusal(message)).toEqual({ tone: "alert", message: quizMessages.checkFields, fieldErrors });
    }
  });

  it("uses fixed sentences for everything else and never the raw message", () => {
    expect(refusal('violates check constraint "activities_title_clean"')).toEqual({
      tone: "alert",
      message: "That was not accepted. Check the text and remove hidden characters.",
    });
    expect(settingsErrorState({ code: "42501", message: "permission denied for table activities" })).toEqual({
      tone: "alert",
      message: "You cannot change this quiz.",
    });
    expect(settingsErrorState({ code: "XX000", message: "secret detail" }).message).toBe(quizMessages.failed);
    expect(settingsErrorState(null).message).toBe(quizMessages.gone);
    expect(settingsErrorState({ code: "P0001", message: "activity_has_attempts" }).message).toBe(quizMessages.failed);
  });
});

describe("quiz write errors", () => {
  it("maps each database refusal to its sentence", () => {
    expect(quizWriteErrorMessage({ code: "23514", message: "activity_not_ready" })).toBe(
      "Add at least one question before publishing.",
    );
    expect(quizWriteErrorMessage({ code: "23514", message: "activity_has_attempts" })).toBe(
      "Students have started this quiz, so it cannot be unpublished. Close it instead.",
    );
    expect(quizWriteErrorMessage({ code: "23503", message: "quiz_attempts_activity_id_fkey" })).toBe(
      "Students have attempts on this quiz, so it cannot be deleted. Close it instead.",
    );
    expect(quizWriteErrorMessage({ code: "23503", message: 'violates "threads_activity_id_fkey"' })).toBe(
      "Students have asked questions on this activity, so it cannot be deleted.",
    );
    expect(quizWriteErrorMessage({ code: "23514", message: "activities_title_clean" })).toBe(quizMessages.rejected);
    expect(quizWriteErrorMessage({ code: "42501" })).toBe(quizMessages.refused);
    expect(quizWriteErrorMessage({ code: "XX000", message: "secret detail" })).toBe(quizMessages.failed);
    expect(quizWriteErrorMessage(null)).toBe(quizMessages.gone);
  });
});

describe("action inputs", () => {
  it("checks the new quiz form", () => {
    expect(createQuizSchema.parse({ classId, title: " Quiz 1 " })).toEqual({ classId, title: "Quiz 1" });
    const empty = createQuizSchema.safeParse({ classId, title: "" });
    expect(empty.success ? "" : titleErrorMessage(empty.error)).toBe("Enter a quiz title");
    const missing = createQuizSchema.safeParse({ classId, title: null });
    expect(missing.success ? "" : titleErrorMessage(missing.error)).toBe("Enter a quiz title");
    const badClass = createQuizSchema.safeParse({ classId: "x", title: "Quiz 1" });
    expect(badClass.success ? "" : titleErrorMessage(badClass.error)).toBe(quizMessages.gone);
  });

  it("reads the move direction as a step", () => {
    expect(moveQuestionSchema.parse({ questionId, step: "up" })).toEqual({ questionId, step: -1 });
    expect(moveQuestionSchema.parse({ questionId, step: "down" })).toEqual({ questionId, step: 1 });
    expect(moveQuestionSchema.safeParse({ questionId, step: "left" }).success).toBe(false);
    expect(moveQuestionSchema.safeParse({ questionId: "1", step: "up" }).success).toBe(false);
  });

  it("reads the published flag as a boolean", () => {
    expect(setQuizPublishedSchema.parse({ activityId, published: "true" }).published).toBe(true);
    expect(setQuizPublishedSchema.parse({ activityId, published: "false" }).published).toBe(false);
    expect(setQuizPublishedSchema.safeParse({ activityId, published: "yes" }).success).toBe(false);
  });

  it("reads an empty question id as a new question", () => {
    expect(saveQuestionTargetSchema.parse({ activityId, questionId: "" })).toEqual({ activityId, questionId: null });
    expect(saveQuestionTargetSchema.parse({ activityId, questionId })).toEqual({ activityId, questionId });
    expect(saveQuestionTargetSchema.safeParse({ activityId, questionId: "new" }).success).toBe(false);
  });

  it("accepts the three kinds for a key change", () => {
    expect(rekeyTargetSchema.safeParse({ questionId, kind: "tf" }).success).toBe(true);
    expect(rekeyTargetSchema.safeParse({ questionId, kind: "essay" }).success).toBe(false);
  });

  it("accepts the builder actions only", () => {
    for (const intent of ["createQuiz", "deleteQuestion", "moveQuestion", "setQuizPublished", "closeQuizNow", "deleteQuiz"]) {
      expect(builderIntentSchema.safeParse(intent).success).toBe(true);
    }
    expect(builderIntentSchema.safeParse("saveQuestion").success).toBe(false);
    expect(builderIntentSchema.safeParse("rekeyQuestion").success).toBe(false);
  });
});

describe("question form values", () => {
  it("reads all three groups from the form", () => {
    const formData = form({
      kind: "ident",
      prompt: "Name the\r\nbroker",
      points: "3",
      option1: "A",
      option2: "B",
      correctOption: "2",
      truth: "false",
      accepted: "RabbitMQ\r\nRabbit MQ",
    });
    expect(questionFromForm(formData)).toEqual({
      kind: "ident",
      prompt: "Name the\nbroker",
      points: "3",
      options: ["A", "B", "", "", "", ""],
      correctOption: "2",
      truth: "false",
      accepted: "RabbitMQ\nRabbit MQ",
    });
    expect(keyFromForm(formData)).toEqual({ correctOption: "2", truth: "false", accepted: "RabbitMQ\nRabbit MQ" });
  });

  it("fills the form from a saved question of each kind", () => {
    const base = { id: questionId, prompt: "Pick", points: 2, position: 1 };
    const mcq: TeacherQuestion = { ...base, kind: "mcq", options: ["A", "B", "C"], key: 2 };
    const tf: TeacherQuestion = { ...base, kind: "tf", options: null, key: false };
    const ident: TeacherQuestion = { ...base, kind: "ident", options: null, key: ["one", "two"] };
    expect(questionValues(mcq)).toMatchObject({
      kind: "mcq",
      prompt: "Pick",
      points: "2",
      options: ["A", "B", "C", "", "", ""],
      correctOption: "3",
    });
    expect(questionValues(tf)).toMatchObject({ kind: "tf", truth: "false", correctOption: "", accepted: "" });
    expect(questionValues(ident)).toMatchObject({ kind: "ident", accepted: "one\ntwo", truth: "" });
    expect(questionValues({ ...mcq, key: null }).correctOption).toBe("");
  });

  it("starts a new question as an empty multiple choice worth one point", () => {
    expect(questionValues(null)).toEqual({
      kind: "mcq",
      prompt: "",
      points: "1",
      options: ["", "", "", "", "", ""],
      correctOption: "",
      truth: "",
      accepted: "",
    });
  });
});

describe("save_quiz_question arguments", () => {
  it("sends a multiple choice key as the index of the right option", () => {
    const built = buildQuestion({ ...question, options: ["RabbitMQ", "Postgres", "Redis", "", "", ""], correctOption: "3" });
    expect(built).toEqual({
      ok: true,
      args: {
        question_kind: "mcq",
        question_prompt: "Which one is a message broker?",
        question_options: ["RabbitMQ", "Postgres", "Redis"],
        question_points: 2,
        key_answers: 2,
      },
    });
    expect(built.ok && typeof built.args.key_answers).toBe("number");
    expect(built.ok && typeof built.args.question_points).toBe("number");
  });

  it("drops empty option rows and counts the index among the filled ones", () => {
    const built = buildQuestion({ ...question, options: ["", " A ", "", "B", "", "C"], correctOption: "6" });
    expect(built.ok && built.args.question_options).toEqual(["A", "B", "C"]);
    expect(built.ok && built.args.key_answers).toBe(2);
  });

  it("refuses too few, repeated or too long options", () => {
    const bad = { ok: false, message: "Use 2 to 6 different options." };
    expect(buildQuestion({ ...question, options: ["Only", "", "", "", "", ""] })).toEqual(bad);
    expect(buildQuestion({ ...question, options: ["Same", " same ", "", "", "", ""] })).toEqual(bad);
    expect(buildQuestion({ ...question, options: ["a".repeat(301), "b", "", "", "", ""] })).toEqual(bad);
    expect(buildQuestion({ ...question, options: [] })).toEqual(bad);
  });

  it("refuses a multiple choice with no right option or one on an empty row", () => {
    const bad = { ok: false, message: quizMessages.badKeyMcq };
    expect(buildQuestion({ ...question, correctOption: "" })).toEqual(bad);
    expect(buildQuestion({ ...question, correctOption: "3" })).toEqual(bad);
    expect(buildQuestion({ ...question, correctOption: "7" })).toEqual(bad);
    expect(buildQuestion({ ...question, correctOption: "1.0" })).toEqual(bad);
  });

  it("sends a true or false key as a real boolean and no options", () => {
    const yes = buildQuestion({ ...question, kind: "tf", truth: "true" });
    const no = buildQuestion({ ...question, kind: "tf", truth: "false" });
    expect(yes.ok && yes.args).toMatchObject({ question_kind: "tf", question_options: null, key_answers: true });
    expect(no.ok && no.args.key_answers).toBe(false);
    expect(buildQuestion({ ...question, kind: "tf", truth: "" })).toEqual({
      ok: false,
      message: "Choose True or False as the right answer.",
    });
    expect(buildQuestion({ ...question, kind: "tf", truth: "1" }).ok).toBe(false);
  });

  it("sends identification answers as an array, one per line, blanks dropped", () => {
    const built = buildQuestion({ ...question, kind: "ident", accepted: "RabbitMQ\r\n\n  Rabbit MQ  \n\n" });
    expect(built.ok && built.args).toMatchObject({
      question_kind: "ident",
      question_options: null,
      key_answers: ["RabbitMQ", "Rabbit MQ"],
    });
    expect(acceptedAnswers("a\rb\r\nc\n \n")).toEqual(["a", "b", "c"]);
  });

  it("refuses no, too many, repeated or too long accepted answers", () => {
    const bad = { ok: false, message: quizMessages.badKeyIdent };
    const eleven = Array.from({ length: 11 }, (_, index) => `answer ${index}`).join("\n");
    expect(buildQuestion({ ...question, kind: "ident", accepted: " \n " })).toEqual(bad);
    expect(buildQuestion({ ...question, kind: "ident", accepted: eleven })).toEqual(bad);
    expect(buildQuestion({ ...question, kind: "ident", accepted: "Manila\nmanila" })).toEqual(bad);
    expect(buildQuestion({ ...question, kind: "ident", accepted: "a".repeat(201) })).toEqual(bad);
    expect(quizMessages.badKeyIdent).toBe(
      "Enter 1 to 10 different accepted answers, one per line, 200 characters each at most.",
    );
  });

  it("trims the prompt and puts prompt and points errors on their fields", () => {
    const trimmed = buildQuestion({ ...question, prompt: "  What?\r\nWhy?  " });
    expect(trimmed.ok && trimmed.args.question_prompt).toBe("What?\nWhy?");
    expect(buildQuestion({ ...question, prompt: "  ", points: "0" })).toEqual({
      ok: false,
      message: quizMessages.checkFields,
      fieldErrors: { prompt: "Enter the question", points: "Enter a whole number from 1 to 100" },
    });
    expect(buildQuestion({ ...question, prompt: "a".repeat(2001) })).toMatchObject({
      fieldErrors: { prompt: "Use 2,000 characters or fewer" },
    });
    for (const points of ["", "101", "2.5", "many"]) {
      expect(buildQuestion({ ...question, points })).toMatchObject({
        fieldErrors: { points: "Enter a whole number from 1 to 100" },
      });
    }
  });

  it("refuses an unknown kind", () => {
    expect(buildQuestion({ ...question, kind: "essay" })).toEqual({
      ok: false,
      message: quizMessages.failed,
      fieldErrors: {},
    });
  });
});

describe("key change value", () => {
  const empty = { correctOption: "", truth: "", accepted: "" };

  it("builds the key for each kind", () => {
    expect(rekeyValue("mcq", { ...empty, correctOption: "1" })).toBe(0);
    expect(rekeyValue("mcq", { ...empty, correctOption: "6" })).toBe(5);
    expect(rekeyValue("tf", { ...empty, truth: "false" })).toBe(false);
    expect(rekeyValue("ident", { ...empty, accepted: "one\n\ntwo" })).toEqual(["one", "two"]);
  });

  it("gives nothing when the key is missing or malformed", () => {
    expect(rekeyValue("mcq", empty)).toBeNull();
    expect(rekeyValue("mcq", { ...empty, correctOption: "0" })).toBeNull();
    expect(rekeyValue("mcq", { ...empty, correctOption: "7" })).toBeNull();
    expect(rekeyValue("tf", { ...empty, truth: "maybe" })).toBeNull();
    expect(rekeyValue("ident", empty)).toBeNull();
  });
});

describe("question statuses", () => {
  it("reads the status from a JSON result or a plain string", () => {
    expect(statusOf({ status: "saved", question_id: questionId })).toBe("saved");
    expect(statusOf("moved")).toBe("moved");
    expect(statusOf(null)).toBe("unknown");
    expect(statusOf({ status: 3 })).toBe("unknown");
    expect(statusOf(["saved"])).toBe("unknown");
  });

  it("maps every save status to its sentence", () => {
    expect(saveQuestionState({ status: "saved" }, "mcq")).toEqual({ tone: "status", message: "Question saved" });
    const expected: [string, string][] = [
      ["locked", "This quiz is published. Unpublish it to change questions."],
      ["bad_options", "Use 2 to 6 different options."],
      ["question_limit", "A quiz can have 100 questions at most."],
      ["bad_question", "Check the question text and the points. Points go from 1 to 100."],
      ["refused", "You cannot change this quiz."],
      ["not_found", "That question is no longer here. Reload the page."],
      ["something_new", "Something went wrong. Try again."],
    ];
    for (const [status, message] of expected) {
      expect(saveQuestionState({ status }, "mcq")).toEqual({ tone: "alert", message });
    }
    expect(saveQuestionState(null, "mcq")).toEqual({ tone: "alert", message: quizMessages.failed });
  });

  it("has a bad key sentence for each kind", () => {
    expect(questionStatusMessage("bad_key", "mcq")).toBe(
      "Choose which option is correct. It must be an option you filled in.",
    );
    expect(questionStatusMessage("bad_key", "tf")).toBe("Choose True or False as the right answer.");
    expect(questionStatusMessage("bad_key", "ident")).toBe(quizMessages.badKeyIdent);
    expect(badKeyMessage("tf")).toBe(quizMessages.badKeyTf);
  });

  it("maps the delete statuses", () => {
    expect(deleteQuestionState("deleted")).toEqual({ tone: "status", message: "Question deleted" });
    expect(deleteQuestionState("locked")).toEqual({ tone: "alert", message: quizMessages.locked });
    expect(deleteQuestionState("not_found")).toEqual({ tone: "alert", message: quizMessages.questionGone });
    expect(deleteQuestionState(null)).toEqual({ tone: "alert", message: quizMessages.failed });
  });

  it("maps the move statuses and stays quiet at the edge", () => {
    expect(moveQuestionState("moved")).toEqual({ tone: "status", message: "Moved" });
    expect(moveQuestionState("edge")).toEqual({});
    expect(moveQuestionState("locked")).toEqual({ tone: "alert", message: quizMessages.locked });
    expect(moveQuestionState("not_found")).toEqual({ tone: "alert", message: quizMessages.questionGone });
    expect(moveQuestionState(undefined)).toEqual({ tone: "alert", message: quizMessages.failed });
  });

  it("says how many attempts a key change regraded", () => {
    expect(rekeyState({ status: "rekeyed", regraded: 12 }, "mcq")).toEqual({
      tone: "status",
      message: "Key changed. 12 attempts regraded.",
    });
    expect(regradedMessage(1)).toBe("Key changed. 1 attempt regraded.");
    expect(regradedMessage(0)).toBe("Key changed. 0 attempts regraded.");
    expect(rekeyState({ status: "rekeyed" }, "tf").message).toBe("Key changed. 0 attempts regraded.");
    expect(rekeyState({ status: "bad_key" }, "tf")).toEqual({ tone: "alert", message: quizMessages.badKeyTf });
    expect(rekeyState({ status: "not_found" }, "ident")).toEqual({ tone: "alert", message: quizMessages.questionGone });
    expect(rekeyState(null, "mcq")).toEqual({ tone: "alert", message: quizMessages.failed });
  });
});
