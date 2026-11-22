import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Json } from "../../src/lib/database.types";
import {
  addQuestion,
  addQuiz,
  admin,
  anon,
  createRouteWorld,
  draftQuiz,
  enrolledStudent,
  publishQuiz,
  readActivity,
  readAnswers,
  readAttempt,
  readKey,
  readQuestions,
  refused,
  removeCreatedUsers,
  saveAnswer,
  saveQuestion,
  secondsFromNow,
  setAttempt,
  startedAttempt,
  submitAttempt,
  type Actor,
  type Client,
  type QuestionSpec,
  type QuizOptions,
} from "./helpers";

const choice: QuestionSpec = {
  kind: "mcq",
  prompt: "Which statement gives a privilege?",
  options: ["GRANT", "REVOKE", "DROP"],
  key: 0,
  points: 2,
};
const trueFalse: QuestionSpec = { kind: "tf", prompt: "A role can be a member of another role.", key: true };
const identification: QuestionSpec = { kind: "ident", prompt: "Name the statement that removes a privilege.", key: ["REVOKE"] };

let world: Awaited<ReturnType<typeof createRouteWorld>>;

function draft(options: QuizOptions = {}) {
  return draftQuiz(world.teacher, world.classroom.id, options);
}

function published(questions: QuestionSpec[], options: QuizOptions = {}) {
  return addQuiz(world.teacher, world.classroom.id, questions, options);
}

function remove(client: Client, questionId: string) {
  return client.rpc("delete_quiz_question", { target_question: questionId });
}

function move(client: Client, questionId: string, step: number | null) {
  return client.rpc("move_quiz_question", { target_question: questionId, step: step as number });
}

function keys(client: Client, activityId: string) {
  return client.rpc("quiz_keys", { target_activity: activityId });
}

async function rekey(client: Client, questionId: string, key: Json) {
  const { data, error } = await client.rpc("rekey_quiz_question", { target_question: questionId, key_answers: key });
  return { result: data as { status: string; regraded?: number } | null, error };
}

function settle(client: Client, activityId: string) {
  return client.rpc("settle_attempts", { target_activity: activityId });
}

async function order(activityId: string): Promise<string[]> {
  return (await readQuestions(activityId)).map((question) => question.id);
}

async function expectStatus(spec: QuestionSpec, status: string) {
  const created = await draft();
  const { result, error } = await saveQuestion(world.teacher.client, created.id, spec);
  expect(error).toBeNull();
  expect(result).toEqual({ status });
  expect(await readQuestions(created.id)).toEqual([]);
}

function strangers(): Actor[] {
  return [world.studentA, world.otherStudent, world.outsider, world.otherTeacher];
}

beforeAll(async () => {
  world = await createRouteWorld();
});

afterAll(removeCreatedUsers);

describe("save_quiz_question", () => {
  it("save_quiz_question: saves a multiple choice question with trimmed options and a number key", async () => {
    const created = await draft();
    const { result, error } = await saveQuestion(world.teacher.client, created.id, {
      kind: "mcq",
      prompt: "  Which statement gives a privilege?\n",
      options: ["  GRANT ", "REVOKE", "DROP   "],
      key: 2,
      points: 4,
    });
    expect(error).toBeNull();
    expect(result).toEqual({ status: "saved", question_id: expect.any(String) });
    expect(await readQuestions(created.id)).toEqual([
      {
        id: result!.question_id,
        activity_id: created.id,
        kind: "mcq",
        prompt: "Which statement gives a privilege?",
        options: ["GRANT", "REVOKE", "DROP"],
        points: 4,
        position: 1,
      },
    ]);
    expect(await readKey(result!.question_id as string)).toBe(2);
  });

  it("save_quiz_question: saves a true or false question with a boolean key and no options", async () => {
    const created = await draft();
    for (const key of [true, false]) {
      const { result } = await saveQuestion(world.teacher.client, created.id, { ...trueFalse, key, options: ["ignored", "too"] });
      expect(result?.status).toBe("saved");
      expect(await readKey(result!.question_id as string)).toBe(key);
    }
    const stored = await readQuestions(created.id);
    expect(stored.map((question) => [question.kind, question.options, question.position])).toEqual([
      ["tf", null, 1],
      ["tf", null, 2],
    ]);
  });

  it("save_quiz_question: saves an identification key as a cleaned list without duplicates by case or spacing", async () => {
    const created = await draft();
    const { result } = await saveQuestion(world.teacher.client, created.id, {
      ...identification,
      key: ["  Grant ", "grant", "GRANT  option", "grant option", "Revoke", "ＲＥＶＯＫＥ"],
    });
    expect(result?.status).toBe("saved");
    expect(await readKey(result!.question_id as string)).toEqual(["Grant", "GRANT option", "Revoke"]);
    expect((await readQuestions(created.id))[0]).toMatchObject({ kind: "ident", options: null, points: 1 });
  });

  it("save_quiz_question: updates a question by id and replaces its key", async () => {
    const created = await draft();
    const questionId = await addQuestion(world.teacher, created.id, choice);
    const other = await addQuestion(world.teacher, created.id, trueFalse);
    const { result, error } = await saveQuestion(
      world.teacher.client,
      created.id,
      { kind: "ident", prompt: "Name the default superuser role.", key: ["postgres"], points: 7 },
      questionId,
    );
    expect(error).toBeNull();
    expect(result).toEqual({ status: "saved", question_id: questionId });
    const stored = await readQuestions(created.id);
    expect(stored).toHaveLength(2);
    expect(stored[0]).toMatchObject({ id: questionId, kind: "ident", prompt: "Name the default superuser role.", options: null, points: 7, position: 1 });
    expect(stored[1].id).toBe(other);
    expect(await readKey(questionId)).toEqual(["postgres"]);
    expect(await readKey(other)).toBe(true);
    expect((await readActivity(created.id))?.points).toBe(8);
  });

  it("save_quiz_question: a student, a student of another class, the outsider and another teacher get refused", async () => {
    const created = await draft();
    const questionId = await addQuestion(world.teacher, created.id, trueFalse);
    for (const actor of strangers()) {
      const added = await saveQuestion(actor.client, created.id, choice);
      expect(added.error).toBeNull();
      expect(added.result).toEqual({ status: "refused" });
      const edited = await saveQuestion(actor.client, created.id, { ...trueFalse, key: false }, questionId);
      expect(edited.result).toEqual({ status: "refused" });
    }
    expect(await readQuestions(created.id)).toHaveLength(1);
    expect(await readKey(questionId)).toBe(true);
  });

  it("save_quiz_question: an unknown activity gets refused", async () => {
    const { result } = await saveQuestion(world.teacher.client, randomUUID(), choice);
    expect(result).toEqual({ status: "refused" });
  });

  it("save_quiz_question: anon cannot call it", async () => {
    const created = await draft();
    const { result, error } = await saveQuestion(anon, created.id, choice);
    expect(error?.code).toBe(refused);
    expect(result).toBeNull();
    expect(await readQuestions(created.id)).toEqual([]);
  });

  it("save_quiz_question: locked once the quiz is published, for a new question and for an edit", async () => {
    const { activity, questionIds } = await published([trueFalse]);
    const added = await saveQuestion(world.teacher.client, activity.id, choice);
    expect(added.result).toEqual({ status: "locked" });
    const edited = await saveQuestion(world.teacher.client, activity.id, { ...trueFalse, key: false }, questionIds[0]);
    expect(edited.result).toEqual({ status: "locked" });
    const invalid = await saveQuestion(world.teacher.client, activity.id, { ...trueFalse, prompt: "" });
    expect(invalid.result).toEqual({ status: "locked" });
    expect(await readQuestions(activity.id)).toHaveLength(1);
    expect(await readKey(questionIds[0])).toBe(true);
  });

  it("save_quiz_question: not_found when the question belongs to another quiz of the same teacher", async () => {
    const first = await draft();
    const second = await draft();
    const questionId = await addQuestion(world.teacher, first.id, trueFalse);
    const { result } = await saveQuestion(world.teacher.client, second.id, { ...trueFalse, key: false, prompt: "Moved" }, questionId);
    expect(result).toEqual({ status: "not_found" });
    expect(await readQuestions(second.id)).toEqual([]);
    expect((await readQuestions(first.id))[0]).toMatchObject({ id: questionId, prompt: trueFalse.prompt });
    expect(await readKey(questionId)).toBe(true);
  });

  it("save_quiz_question: not_found for a question of another teacher's quiz and for an unknown question", async () => {
    const mine = await draft();
    const theirs = await draftQuiz(world.otherTeacher, world.otherClassroom.id);
    const theirQuestion = await addQuestion(world.otherTeacher, theirs.id, identification);
    for (const questionId of [theirQuestion, randomUUID()]) {
      const { result } = await saveQuestion(world.teacher.client, mine.id, { ...trueFalse, prompt: "Hijacked" }, questionId);
      expect(result).toEqual({ status: "not_found" });
    }
    expect(await readQuestions(mine.id)).toEqual([]);
    expect((await readQuestions(theirs.id))[0]).toMatchObject({ id: theirQuestion, kind: "ident", prompt: identification.prompt });
    expect(await readKey(theirQuestion)).toEqual(["REVOKE"]);
    const reverse = await saveQuestion(world.teacher.client, theirs.id, trueFalse, theirQuestion);
    expect(reverse.result).toEqual({ status: "refused" });
  });

  const badQuestions: [string, Partial<QuestionSpec>][] = [
    ["an empty prompt", { prompt: "" }],
    ["a prompt of spaces and line breaks", { prompt: "  \n\t " }],
    ["a null prompt", { prompt: null }],
    ["a prompt of 2,001 characters", { prompt: "a".repeat(2001) }],
    ["a prompt with a direction override", { prompt: "Which‮one" }],
    ["points 0", { points: 0 }],
    ["points 101", { points: 101 }],
    ["negative points", { points: -1 }],
    ["null points", { points: null }],
    ["an unknown kind", { kind: "essay" }],
    ["an empty kind", { kind: "" }],
  ];

  it.each(badQuestions)("save_quiz_question: bad_question for %s", async (_label, change) => {
    await expectStatus({ ...trueFalse, ...change }, "bad_question");
  });

  it("save_quiz_question: the edge values of a question are accepted", async () => {
    const created = await draft();
    for (const spec of [
      { ...trueFalse, prompt: "a".repeat(2000), points: 100 },
      { ...trueFalse, points: 1 },
    ]) {
      expect((await saveQuestion(world.teacher.client, created.id, spec)).result?.status).toBe("saved");
    }
  });

  const badOptions: [string, Json][] = [
    ["one option", ["GRANT"]],
    ["seven options", ["a", "b", "c", "d", "e", "f", "g"]],
    ["no options", null],
    ["an empty list", []],
    ["a blank option", ["GRANT", "   "]],
    ["an empty option", ["GRANT", ""]],
    ["duplicates that differ by case", ["Grant", "GRANT"]],
    ["duplicates that differ by spaces", ["grant  option", " grant option "]],
    ["a number among the options", ["GRANT", 5]],
    ["a null among the options", ["GRANT", null]],
    ["a list among the options", ["GRANT", ["REVOKE"]]],
    ["an object instead of a list", { 0: "GRANT", 1: "REVOKE" }],
    ["text instead of a list", "GRANT,REVOKE"],
    ["an option of 301 characters", ["GRANT", "a".repeat(301)]],
    ["an option with a zero width space", ["GRANT", "REV​OKE"]],
  ];

  it.each(badOptions)("save_quiz_question: bad_options for %s", async (_label, options) => {
    await expectStatus({ ...choice, options, key: 0 }, "bad_options");
  });

  it("save_quiz_question: two and six options are accepted", async () => {
    const created = await draft();
    for (const options of [["a", "b"], ["a", "b", "c", "d", "e", "f"]]) {
      const { result } = await saveQuestion(world.teacher.client, created.id, { ...choice, options, key: options.length - 1 });
      expect(result?.status).toBe("saved");
    }
  });

  const badKeys: [string, QuestionSpec][] = [
    ["a multiple choice index out of range", { ...choice, key: 3 }],
    ["a negative multiple choice index", { ...choice, key: -1 }],
    ["a multiple choice index as text", { ...choice, key: "0" }],
    ["a multiple choice index of 1.5", { ...choice, key: 1.5 }],
    ["a multiple choice key as a list", { ...choice, key: [0] }],
    ["a multiple choice key as a boolean", { ...choice, key: true }],
    ["a missing multiple choice key", { ...choice, key: null }],
    ["a true or false key as the text true", { ...trueFalse, key: "true" }],
    ["a true or false key as the number 1", { ...trueFalse, key: 1 }],
    ["a true or false key as a list", { ...trueFalse, key: [true] }],
    ["a missing true or false key", { ...trueFalse, key: null }],
    ["an empty identification list", { ...identification, key: [] }],
    ["eleven identification answers", { ...identification, key: Array.from({ length: 11 }, (_, index) => `answer ${index}`) }],
    ["an identification answer that is only spaces", { ...identification, key: ["REVOKE", "   "] }],
    ["an identification answer that is only zero width characters", { ...identification, key: ["​​﻿"] }],
    ["an identification answer that is a number", { ...identification, key: ["REVOKE", 5] }],
    ["an identification answer that is null", { ...identification, key: [null] }],
    ["an identification key as plain text", { ...identification, key: "REVOKE" }],
    ["an identification answer of 201 characters", { ...identification, key: ["a".repeat(201)] }],
  ];

  it.each(badKeys)("save_quiz_question: bad_key for %s", async (_label, spec) => {
    await expectStatus(spec, "bad_key");
  });

  it("save_quiz_question: ten identification answers of 200 characters are accepted", async () => {
    const created = await draft();
    const key = Array.from({ length: 10 }, (_, index) => `${index}`.padEnd(200, "a"));
    const { result } = await saveQuestion(world.teacher.client, created.id, { ...identification, key });
    expect(result?.status).toBe("saved");
    expect(await readKey(result!.question_id as string)).toEqual(key);
  });

  it("save_quiz_question: a rejected edit leaves the question and its key as they were", async () => {
    const created = await draft();
    const questionId = await addQuestion(world.teacher, created.id, choice);
    const before = await readQuestions(created.id);
    for (const spec of [
      { ...choice, prompt: "" },
      { ...choice, options: ["only"] },
      { ...choice, key: 9 },
    ]) {
      const { result } = await saveQuestion(world.teacher.client, created.id, spec, questionId);
      expect(result?.status).toMatch(/^bad_/);
    }
    expect(await readQuestions(created.id)).toEqual(before);
    expect(await readKey(questionId)).toBe(0);
  });

  it("save_quiz_question: question_limit at 100 questions, and an edit still works", async () => {
    const created = await draft();
    const first = await addQuestion(world.teacher, created.id, trueFalse);
    const filler = Array.from({ length: 99 }, (_, index) => ({
      activity_id: created.id,
      kind: "tf",
      prompt: `Statement ${index + 2} is true.`,
      points: 1,
      position: index + 2,
    }));
    expect((await admin.from("quiz_questions").insert(filler)).error).toBeNull();
    const { result } = await saveQuestion(world.teacher.client, created.id, choice);
    expect(result).toEqual({ status: "question_limit" });
    expect(await readQuestions(created.id)).toHaveLength(100);
    const edited = await saveQuestion(world.teacher.client, created.id, { ...trueFalse, key: false }, first);
    expect(edited.result).toEqual({ status: "saved", question_id: first });
    expect((await readActivity(created.id))?.points).toBe(100);
  });

  it("activities publish: refused while a question has no key", async () => {
    const created = await draft();
    await addQuestion(world.teacher, created.id, trueFalse);
    const keyless = await admin
      .from("quiz_questions")
      .insert({ activity_id: created.id, kind: "tf", prompt: "No key yet.", points: 1, position: 2 });
    expect(keyless.error).toBeNull();
    const { error } = await publishQuiz(world.teacher.client, created.id);
    expect(error?.message).toContain("activity_not_ready");
  });
});

describe("delete_quiz_question", () => {
  it("delete_quiz_question: the teacher deletes a question and its key", async () => {
    const created = await draft();
    const kept = await addQuestion(world.teacher, created.id, trueFalse);
    const gone = await addQuestion(world.teacher, created.id, identification);
    const { data, error } = await remove(world.teacher.client, gone);
    expect(error).toBeNull();
    expect(data).toBe("deleted");
    expect(await order(created.id)).toEqual([kept]);
    expect(await readKey(gone)).toBeUndefined();
    expect(await readKey(kept)).toBe(true);
  });

  it("delete_quiz_question: locked once published", async () => {
    const { activity, questionIds } = await published([trueFalse, choice]);
    const { data, error } = await remove(world.teacher.client, questionIds[0]);
    expect(error).toBeNull();
    expect(data).toBe("locked");
    expect(await order(activity.id)).toEqual(questionIds);
  });

  it("delete_quiz_question: not_found for everyone else, a foreign question, an unknown id and null", async () => {
    const created = await draft();
    const questionId = await addQuestion(world.teacher, created.id, trueFalse);
    for (const actor of strangers()) {
      const { data, error } = await remove(actor.client, questionId);
      expect(error).toBeNull();
      expect(data).toBe("not_found");
    }
    const theirs = await draftQuiz(world.otherTeacher, world.otherClassroom.id);
    const theirQuestion = await addQuestion(world.otherTeacher, theirs.id, trueFalse);
    for (const target of [theirQuestion, randomUUID(), null]) {
      expect((await remove(world.teacher.client, target as string)).data).toBe("not_found");
    }
    expect(await order(created.id)).toEqual([questionId]);
    expect(await order(theirs.id)).toEqual([theirQuestion]);
  });

  it("delete_quiz_question: anon cannot call it", async () => {
    const created = await draft();
    const questionId = await addQuestion(world.teacher, created.id, trueFalse);
    const { data, error } = await remove(anon, questionId);
    expect(error?.code).toBe(refused);
    expect(data).toBeNull();
    expect(await order(created.id)).toEqual([questionId]);
  });
});

describe("move_quiz_question", () => {
  it("move_quiz_question: moves up and down and keeps the order after several moves", async () => {
    const created = await draft();
    const first = await addQuestion(world.teacher, created.id, trueFalse);
    const second = await addQuestion(world.teacher, created.id, choice);
    const third = await addQuestion(world.teacher, created.id, identification);
    expect((await move(world.teacher.client, second, -1)).data).toBe("moved");
    expect(await order(created.id)).toEqual([second, first, third]);
    expect((await move(world.teacher.client, second, 1)).data).toBe("moved");
    expect((await move(world.teacher.client, second, 1)).data).toBe("moved");
    expect(await order(created.id)).toEqual([first, third, second]);
    expect((await move(world.teacher.client, first, 1)).data).toBe("moved");
    expect(await order(created.id)).toEqual([third, first, second]);
    const positions = (await readQuestions(created.id)).map((question) => question.position);
    expect(new Set(positions).size).toBe(3);
  });

  it("move_quiz_question: edge at the top, at the bottom and with a single question", async () => {
    const created = await draft();
    const first = await addQuestion(world.teacher, created.id, trueFalse);
    expect((await move(world.teacher.client, first, -1)).data).toBe("edge");
    expect((await move(world.teacher.client, first, 1)).data).toBe("edge");
    const second = await addQuestion(world.teacher, created.id, choice);
    expect((await move(world.teacher.client, first, -1)).data).toBe("edge");
    expect((await move(world.teacher.client, second, 1)).data).toBe("edge");
    expect(await order(created.id)).toEqual([first, second]);
  });

  it("move_quiz_question: locked once published", async () => {
    const { activity, questionIds } = await published([trueFalse, choice]);
    expect((await move(world.teacher.client, questionIds[0], 1)).data).toBe("locked");
    expect(await order(activity.id)).toEqual(questionIds);
  });

  it("move_quiz_question: not_found for everyone else, a foreign question, an unknown id and a bad step", async () => {
    const created = await draft();
    const first = await addQuestion(world.teacher, created.id, trueFalse);
    const second = await addQuestion(world.teacher, created.id, choice);
    for (const actor of strangers()) {
      const { data, error } = await move(actor.client, first, 1);
      expect(error).toBeNull();
      expect(data).toBe("not_found");
    }
    const theirs = await draftQuiz(world.otherTeacher, world.otherClassroom.id);
    const theirFirst = await addQuestion(world.otherTeacher, theirs.id, trueFalse);
    const theirSecond = await addQuestion(world.otherTeacher, theirs.id, choice);
    expect((await move(world.teacher.client, theirFirst, 1)).data).toBe("not_found");
    expect((await move(world.teacher.client, randomUUID(), 1)).data).toBe("not_found");
    for (const step of [0, 2, -2, null]) {
      expect((await move(world.teacher.client, first, step)).data).toBe("not_found");
    }
    expect(await order(created.id)).toEqual([first, second]);
    expect(await order(theirs.id)).toEqual([theirFirst, theirSecond]);
  });

  it("move_quiz_question: anon cannot call it", async () => {
    const created = await draft();
    const first = await addQuestion(world.teacher, created.id, trueFalse);
    const { data, error } = await move(anon, first, 1);
    expect(error?.code).toBe(refused);
    expect(data).toBeNull();
  });
});

describe("quiz_keys", () => {
  let activityId: string;
  let questionIds: string[];

  beforeAll(async () => {
    const quiz = await published([choice, trueFalse, identification]);
    activityId = quiz.activity.id;
    questionIds = quiz.questionIds;
  });

  it("quiz_keys: the class teacher gets one row per question", async () => {
    const { data, error } = await keys(world.teacher.client, activityId);
    expect(error).toBeNull();
    const byQuestion = new Map(data!.map((row) => [row.question_id, row.answers]));
    expect(byQuestion.size).toBe(3);
    expect(byQuestion.get(questionIds[0])).toBe(0);
    expect(byQuestion.get(questionIds[1])).toBe(true);
    expect(byQuestion.get(questionIds[2])).toEqual(["REVOKE"]);
  });

  it("quiz_keys: a student in the class, a student of another class, the outsider and another teacher get no rows", async () => {
    for (const actor of strangers()) {
      const { data, error } = await keys(actor.client, activityId);
      expect(error).toBeNull();
      expect(data).toEqual([]);
    }
  });

  it("quiz_keys: no rows for a student who has submitted an attempt", async () => {
    const attemptId = await startedAttempt(world.studentB.client, activityId);
    await submitAttempt(world.studentB.client, attemptId);
    expect((await keys(world.studentB.client, activityId)).data).toEqual([]);
  });

  it("quiz_keys: an unknown activity gives no rows and anon cannot call it", async () => {
    expect((await keys(world.teacher.client, randomUUID())).data).toEqual([]);
    const { data, error } = await keys(anon, activityId);
    expect(error?.code).toBe(refused);
    expect(data).toBeNull();
  });
});

describe("rekey_quiz_question", () => {
  it("rekey_quiz_question: works after publish, regrades submitted attempts in both directions and leaves open ones alone", async () => {
    const { activity, questionIds } = await published([
      { ...trueFalse, points: 2 },
      { ...identification, key: ["alpha"], points: 3 },
    ]);
    const [truth, named] = questionIds;
    const third = await enrolledStudent(world.classroom.id, "open");

    const gains = await startedAttempt(world.studentA.client, activity.id);
    await submitAttempt(world.studentA.client, gains, { [truth]: true, [named]: "beta" });
    const loses = await startedAttempt(world.studentB.client, activity.id);
    await submitAttempt(world.studentB.client, loses, { [truth]: false, [named]: "Alpha" });
    const open = await startedAttempt(third.client, activity.id);
    await saveAnswer(third.client, open, named, "beta");

    const before = { gains: await readAttempt(gains), loses: await readAttempt(loses), open: await readAttempt(open) };
    expect([before.gains.score, before.loses.score, before.open.score]).toEqual([2, 3, null]);
    const openAnswers = await readAnswers(open);

    const { result, error } = await rekey(world.teacher.client, named, ["  Beta ", "gamma"]);
    expect(error).toBeNull();
    expect(result).toEqual({ status: "rekeyed", regraded: 2 });
    expect(await readKey(named)).toEqual(["Beta", "gamma"]);

    expect(await readAttempt(gains)).toEqual({ ...before.gains, score: 5 });
    expect(await readAttempt(loses)).toEqual({ ...before.loses, score: 0 });
    expect(await readAttempt(open)).toEqual(before.open);
    expect(await readAnswers(open)).toEqual(openAnswers);

    const flipped = await rekey(world.teacher.client, truth, false);
    expect(flipped.result).toEqual({ status: "rekeyed", regraded: 2 });
    expect((await readAttempt(gains)).score).toBe(3);
    expect((await readAttempt(loses)).score).toBe(2);
    expect((await readAttempt(gains)).submitted_at).toBe(before.gains.submitted_at);
    expect((await readAttempt(loses)).submitted_at).toBe(before.loses.submitted_at);

    const answers = await readAnswers(gains);
    expect(answers.find((row) => row.question_id === named)?.is_correct).toBe(true);
    expect(answers.find((row) => row.question_id === truth)?.is_correct).toBe(false);
  });

  it("rekey_quiz_question: works on a draft with no attempts", async () => {
    const created = await draft();
    const questionId = await addQuestion(world.teacher, created.id, choice);
    expect((await rekey(world.teacher.client, questionId, 2)).result).toEqual({ status: "rekeyed", regraded: 0 });
    expect(await readKey(questionId)).toBe(2);
  });

  it("rekey_quiz_question: bad_key keeps the old key and cannot change the kind or the options", async () => {
    const { activity, questionIds } = await published([choice, trueFalse, identification]);
    const before = await readQuestions(activity.id);
    const cases: [string, Json][] = [
      [questionIds[0], 3],
      [questionIds[0], -1],
      [questionIds[0], "1"],
      [questionIds[0], true],
      [questionIds[0], ["GRANT"]],
      [questionIds[0], null],
      [questionIds[1], "true"],
      [questionIds[1], 1],
      [questionIds[1], ["yes"]],
      [questionIds[2], []],
      [questionIds[2], ["   "]],
      [questionIds[2], "REVOKE"],
      [questionIds[2], 0],
      [questionIds[2], { options: ["a", "b"], kind: "mcq" }],
    ];
    for (const [questionId, key] of cases) {
      const { result, error } = await rekey(world.teacher.client, questionId, key);
      expect(error).toBeNull();
      expect(result).toEqual({ status: "bad_key" });
    }
    expect(await readKey(questionIds[0])).toBe(0);
    expect(await readKey(questionIds[1])).toBe(true);
    expect(await readKey(questionIds[2])).toEqual(["REVOKE"]);
    expect((await rekey(world.teacher.client, questionIds[0], 1)).result?.status).toBe("rekeyed");
    expect(await readQuestions(activity.id)).toEqual(before);
    expect((await readActivity(activity.id))?.points).toBe(activity.points);
  });

  it("rekey_quiz_question: not_found for a student, another teacher, a foreign question and an unknown id", async () => {
    const { questionIds } = await published([trueFalse]);
    for (const actor of strangers()) {
      const { result, error } = await rekey(actor.client, questionIds[0], false);
      expect(error).toBeNull();
      expect(result).toEqual({ status: "not_found" });
    }
    const theirs = await draftQuiz(world.otherTeacher, world.otherClassroom.id);
    const theirQuestion = await addQuestion(world.otherTeacher, theirs.id, trueFalse);
    for (const target of [theirQuestion, randomUUID(), null]) {
      expect((await rekey(world.teacher.client, target as string, false)).result).toEqual({ status: "not_found" });
    }
    expect(await readKey(questionIds[0])).toBe(true);
    expect(await readKey(theirQuestion)).toBe(true);
  });

  it("rekey_quiz_question: anon cannot call it", async () => {
    const { questionIds } = await published([trueFalse]);
    const { result, error } = await rekey(anon, questionIds[0], false);
    expect(error?.code).toBe(refused);
    expect(result).toBeNull();
    expect(await readKey(questionIds[0])).toBe(true);
  });
});

describe("settle_attempts", () => {
  async function timedQuiz() {
    const quiz = await published([{ ...trueFalse, points: 2 }, { ...identification, points: 3 }], { timeLimitMin: 10 });
    const attemptId = await startedAttempt(world.studentA.client, quiz.activity.id);
    await saveAnswer(world.studentA.client, attemptId, quiz.questionIds[0], true);
    return { ...quiz, attemptId };
  }

  it("settle_attempts: grades an expired attempt, returns 1 and stamps the expiry time", async () => {
    const { activity, attemptId, questionIds } = await timedQuiz();
    const expiredAt = secondsFromNow(-60);
    await setAttempt(attemptId, { expires_at: expiredAt });
    const { data, error } = await settle(world.teacher.client, activity.id);
    expect(error).toBeNull();
    expect(data).toBe(1);
    const settled = await readAttempt(attemptId);
    expect(settled).toMatchObject({ score: 2, max_score: 5 });
    expect(Date.parse(settled.submitted_at!)).toBe(Date.parse(expiredAt));
    expect(settled.submitted_at).toBe(settled.expires_at);
    const answers = await readAnswers(attemptId);
    expect(answers).toHaveLength(2);
    expect(answers.find((row) => row.question_id === questionIds[0])).toMatchObject({ answer: true, is_correct: true });
    expect(answers.find((row) => row.question_id === questionIds[1])).toMatchObject({ answer: null, is_correct: false });
    expect((await settle(world.teacher.client, activity.id)).data).toBe(0);
    expect(await readAttempt(attemptId)).toEqual(settled);
  });

  it("settle_attempts: returns 0 and changes nothing for a student, the outsider or another teacher", async () => {
    const { activity, attemptId } = await timedQuiz();
    await setAttempt(attemptId, { expires_at: secondsFromNow(-60) });
    const before = await readAttempt(attemptId);
    const answers = await readAnswers(attemptId);
    for (const actor of strangers()) {
      const { data, error } = await settle(actor.client, activity.id);
      expect(error).toBeNull();
      expect(data).toBe(0);
    }
    expect(await readAttempt(attemptId)).toEqual(before);
    expect(await readAnswers(attemptId)).toEqual(answers);
  });

  it("settle_attempts: leaves an attempt inside the grace, one still running and one with no expiry alone", async () => {
    const { activity, attemptId } = await timedQuiz();
    await setAttempt(attemptId, { expires_at: secondsFromNow(-5) });
    const running = await startedAttempt(world.studentB.client, activity.id);
    const endless = await published([trueFalse]);
    const endlessAttempt = await startedAttempt(world.studentA.client, endless.activity.id);
    const before = [await readAttempt(attemptId), await readAttempt(running), await readAttempt(endlessAttempt)];
    expect((await settle(world.teacher.client, activity.id)).data).toBe(0);
    expect((await settle(world.teacher.client, endless.activity.id)).data).toBe(0);
    expect([await readAttempt(attemptId), await readAttempt(running), await readAttempt(endlessAttempt)]).toEqual(before);
    expect(before.every((attempt) => attempt.submitted_at === null && attempt.score === null)).toBe(true);
  });

  it("settle_attempts: settles every expired attempt of the quiz and no attempt of another quiz", async () => {
    const { activity, attemptId } = await timedQuiz();
    const second = await startedAttempt(world.studentB.client, activity.id);
    const other = await timedQuiz();
    for (const id of [attemptId, second, other.attemptId]) await setAttempt(id, { expires_at: secondsFromNow(-120) });
    expect((await settle(world.teacher.client, activity.id)).data).toBe(2);
    expect((await readAttempt(second)).score).toBe(0);
    expect((await readAttempt(other.attemptId)).submitted_at).toBeNull();
  });

  it("settle_attempts: an unknown activity gives 0 and anon cannot call it", async () => {
    expect((await settle(world.teacher.client, randomUUID())).data).toBe(0);
    const { activity } = await published([trueFalse]);
    const { data, error } = await settle(anon, activity.id);
    expect(error?.code).toBe(refused);
    expect(data).toBeNull();
  });
});
