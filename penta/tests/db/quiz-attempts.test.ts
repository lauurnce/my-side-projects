import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Json } from "../../src/lib/database.types";
import {
  addDeck,
  addQuestion,
  addQuiz,
  admin,
  anon,
  attemptPaper,
  attemptReview,
  createRouteWorld,
  draftQuiz,
  enrolledStudent,
  finishDeck,
  readActivity,
  readAnswers,
  readAttempt,
  readAttempts,
  refused,
  removeCreatedUsers,
  removeFromClass,
  saveAnswer,
  secondsFromNow,
  setActivity,
  setAttempt,
  startAttempt,
  startedAttempt,
  submitAttempt,
  type Actor,
  type Client,
  type QuestionSpec,
  type QuizOptions,
  type QuizReply,
} from "./helpers";

type PaperQuestion = { id: string; kind: string; prompt: string; options: string[] | null; points: number; position: number };
type ReviewItem = { question_id: string; answer: Json; is_correct?: boolean; accepted?: Json };

const marker = "OKAPI-KEY-5519";
const choiceOptions = ["REVOKE", "GRANT", "DROP", "ALTER"];
const specs: QuestionSpec[] = [
  { kind: "mcq", prompt: "Which statement gives a privilege?", options: choiceOptions, key: 1, points: 2 },
  { kind: "tf", prompt: "A role can be a member of another role.", key: true, points: 1 },
  { kind: "ident", prompt: "Type the secret word.", key: [marker, "second word"], points: 3 },
];
const maxScore = 6;
const perfect = (ids: string[]) => ({ [ids[0]]: 1, [ids[1]]: true, [ids[2]]: marker });

let world: Awaited<ReturnType<typeof createRouteWorld>>;

function quiz(options: QuizOptions = {}) {
  return addQuiz(world.teacher, world.classroom.id, specs, options);
}

async function openQuiz(options: QuizOptions = {}, student: Actor = world.studentA) {
  const made = await quiz(options);
  const attemptId = await startedAttempt(student.client, made.activity.id);
  return { ...made, attemptId };
}

async function submittedQuiz(options: QuizOptions = {}, answers?: (ids: string[]) => Json) {
  const made = await openQuiz(options);
  const { result } = await submitAttempt(world.studentA.client, made.attemptId, (answers ?? perfect)(made.questionIds));
  expect(result?.status).toBe("submitted");
  return made;
}

function items(result: QuizReply | null): ReviewItem[] {
  return result!.items as unknown as ReviewItem[];
}

function answerOf(rows: Awaited<ReturnType<typeof readAnswers>>, questionId: string) {
  return rows.find((row) => row.question_id === questionId);
}

async function statuses(client: Client, activityId: string, times: number): Promise<string[]> {
  const replies = await Promise.all(Array.from({ length: times }, () => startAttempt(client, activityId)));
  for (const reply of replies) expect(reply.error).toBeNull();
  return replies.map((reply) => reply.result!.status).sort();
}

async function visibleAttempts(client: Client, activityId: string) {
  const { data, error } = await client.from("quiz_attempts").select("id, student_id").eq("activity_id", activityId);
  expect(error).toBeNull();
  return data!.map((row) => row.id).sort();
}

beforeAll(async () => {
  world = await createRouteWorld();
});

afterAll(removeCreatedUsers);

describe("start_attempt", () => {
  it("start_attempt: started with attempt 1, the quiz points and an expiry of start plus the limit", async () => {
    const { activity } = await quiz({ timeLimitMin: 15 });
    const { result, error } = await startAttempt(world.studentA.client, activity.id);
    expect(error).toBeNull();
    expect(result).toEqual({ status: "started", attempt_id: expect.any(String) });
    const attempt = await readAttempt(result!.attempt_id as string);
    expect(attempt).toMatchObject({
      activity_id: activity.id,
      student_id: world.studentA.id,
      attempt_no: 1,
      max_score: maxScore,
      score: null,
      submitted_at: null,
      answers_seen_at: null,
    });
    expect(Date.parse(attempt.expires_at!) - Date.parse(attempt.started_at)).toBe(15 * 60 * 1000);
    expect(Math.abs(Date.now() - Date.parse(attempt.started_at))).toBeLessThan(60_000);
  });

  it("start_attempt: the expiry is the due time when that is earlier than the limit", async () => {
    const dueAt = secondsFromNow(300);
    const { attemptId } = await openQuiz({ timeLimitMin: 15, dueAt });
    expect(Date.parse((await readAttempt(attemptId)).expires_at!)).toBe(Date.parse(dueAt));
  });

  it("start_attempt: the expiry is the limit when the due time is later, the due time with no limit, and null with neither", async () => {
    const limited = await readAttempt((await openQuiz({ timeLimitMin: 15, dueAt: secondsFromNow(7200) })).attemptId);
    expect(Date.parse(limited.expires_at!) - Date.parse(limited.started_at)).toBe(15 * 60 * 1000);
    const dueAt = secondsFromNow(7200);
    const dueOnly = await readAttempt((await openQuiz({ dueAt })).attemptId);
    expect(Date.parse(dueOnly.expires_at!)).toBe(Date.parse(dueAt));
    const endless = await readAttempt((await openQuiz()).attemptId);
    expect(endless.expires_at).toBeNull();
  });

  it("start_attempt: resumed returns the same id and adds no row", async () => {
    const { activity, attemptId } = await openQuiz({ attemptLimit: 3 });
    for (let call = 0; call < 3; call += 1) {
      const { result, error } = await startAttempt(world.studentA.client, activity.id);
      expect(error).toBeNull();
      expect(result).toEqual({ status: "resumed", attempt_id: attemptId });
    }
    expect(await readAttempts(activity.id)).toHaveLength(1);
  });

  it("start_attempt: not_found for a draft, also for the teacher", async () => {
    const created = await draftQuiz(world.teacher, world.classroom.id);
    await addQuestion(world.teacher, created.id, specs[1]);
    for (const actor of [world.studentA, world.teacher]) {
      const { result, error } = await startAttempt(actor.client, created.id);
      expect(error).toBeNull();
      expect(result).toEqual({ status: "not_found" });
    }
    expect(await readAttempts(created.id)).toEqual([]);
  });

  it("start_attempt: not_found for a student of another class, the outsider, the teacher, another teacher and an unknown id", async () => {
    const { activity } = await quiz();
    for (const actor of [world.otherStudent, world.outsider, world.teacher, world.otherTeacher]) {
      const { result, error } = await startAttempt(actor.client, activity.id);
      expect(error).toBeNull();
      expect(result).toEqual({ status: "not_found" });
    }
    for (const unknown of [randomUUID(), null]) {
      expect((await startAttempt(world.studentA.client, unknown as string)).result).toEqual({ status: "not_found" });
    }
    expect(await readAttempts(activity.id)).toEqual([]);
  });

  it("start_attempt: not_found for a removed student, who also cannot resume", async () => {
    const student = await enrolledStudent(world.classroom.id, "removed");
    const { activity } = await openQuiz({ attemptLimit: 2 }, student);
    await removeFromClass(world.teacher, world.classroom.id, student.id);
    expect((await startAttempt(student.client, activity.id)).result).toEqual({ status: "not_found" });
    expect(await readAttempts(activity.id)).toHaveLength(1);
  });

  it("start_attempt: anon cannot call it", async () => {
    const { activity } = await quiz();
    const { result, error } = await startAttempt(anon, activity.id);
    expect(error?.code).toBe(refused);
    expect(result).toBeNull();
    expect(await readAttempts(activity.id)).toEqual([]);
  });

  it("start_attempt: closed at and after the due time", async () => {
    for (const secondsLate of [0, 1, 86400]) {
      const { activity } = await quiz({ dueAt: secondsFromNow(3600), attemptLimit: 3 });
      await setActivity(activity.id, { due_at: secondsFromNow(-secondsLate) });
      const { result, error } = await startAttempt(world.studentA.client, activity.id);
      expect(error).toBeNull();
      expect(result).toEqual({ status: "closed" });
      expect(await readAttempts(activity.id)).toEqual([]);
    }
  });

  it("start_attempt: closed after the teacher closes the quiz, and the open attempt is graded once the grace has passed", async () => {
    const { activity, attemptId, questionIds } = await openQuiz({ attemptLimit: 3 });
    await saveAnswer(world.studentA.client, attemptId, questionIds[1], true);
    const closed = await world.teacher.client.from("activities").update({ due_at: secondsFromNow(-60) }).eq("id", activity.id);
    expect(closed.error).toBeNull();
    expect((await startAttempt(world.studentA.client, activity.id)).result).toEqual({ status: "closed" });
    const settled = await readAttempt(attemptId);
    expect(settled.score).toBe(1);
    expect(settled.submitted_at).toBe(settled.expires_at);
    expect((await startAttempt(world.studentB.client, activity.id)).result).toEqual({ status: "closed" });
  });

  it("start_attempt: limit after the allowed attempts", async () => {
    const { activity } = await quiz({ attemptLimit: 2 });
    for (const attemptNo of [1, 2]) {
      const attemptId = await startedAttempt(world.studentA.client, activity.id);
      expect((await readAttempt(attemptId)).attempt_no).toBe(attemptNo);
      await submitAttempt(world.studentA.client, attemptId);
    }
    for (let call = 0; call < 2; call += 1) {
      const { result, error } = await startAttempt(world.studentA.client, activity.id);
      expect(error).toBeNull();
      expect(result).toEqual({ status: "limit" });
    }
    expect(await readAttempts(activity.id)).toHaveLength(2);
    expect((await startAttempt(world.studentB.client, activity.id)).result?.status).toBe("started");
  });

  it("start_attempt: locked with the deck id until the required deck is finished", async () => {
    const deck = await addDeck(world.classroom.id, world.teacher.id, { slideCount: 4 });
    const { activity } = await quiz({ deckId: deck.id });
    const locked = await startAttempt(world.studentA.client, activity.id);
    expect(locked.error).toBeNull();
    expect(locked.result).toEqual({ status: "locked", deck_id: deck.id });
    expect(await readAttempts(activity.id)).toEqual([]);

    await finishDeck(deck.id, world.studentA.id, 3);
    expect((await startAttempt(world.studentA.client, activity.id)).result).toEqual({ status: "locked", deck_id: deck.id });
    await admin.from("deck_views").delete().eq("deck_id", deck.id).eq("student_id", world.studentA.id);

    await finishDeck(deck.id, world.studentA.id, 4);
    const started = await startAttempt(world.studentA.client, activity.id);
    expect(started.result).toEqual({ status: "started", attempt_id: expect.any(String) });
    expect((await startAttempt(world.studentB.client, activity.id)).result).toEqual({ status: "locked", deck_id: deck.id });
  });
});

describe("start_attempt under a race", () => {
  it("start_attempt race: with limit 1, five calls at once give one started, four resumed and one row", async () => {
    const { activity } = await quiz({ attemptLimit: 1 });
    expect(await statuses(world.studentA.client, activity.id, 5)).toEqual(["resumed", "resumed", "resumed", "resumed", "started"]);
    const rows = await readAttempts(activity.id);
    expect(rows).toHaveLength(1);
    expect(rows[0].attempt_no).toBe(1);

    await submitAttempt(world.studentA.client, rows[0].id);
    expect(await statuses(world.studentA.client, activity.id, 5)).toEqual(["limit", "limit", "limit", "limit", "limit"]);
    expect(await readAttempts(activity.id)).toHaveLength(1);
  });

  it("start_attempt race: with limit 2 and one submitted, five calls at once add exactly one row", async () => {
    const { activity, attemptId } = await openQuiz({ attemptLimit: 2 });
    await submitAttempt(world.studentA.client, attemptId);
    expect(await statuses(world.studentA.client, activity.id, 5)).toEqual(["resumed", "resumed", "resumed", "resumed", "started"]);
    const rows = await readAttempts(activity.id);
    expect(rows.map((row) => row.attempt_no)).toEqual([1, 2]);
    await submitAttempt(world.studentA.client, rows[1].id);
    expect(await statuses(world.studentA.client, activity.id, 5)).toEqual(["limit", "limit", "limit", "limit", "limit"]);
    expect(await readAttempts(activity.id)).toHaveLength(2);
  });

  it("start_attempt race: two students at once each get their own first attempt", async () => {
    const { activity } = await quiz();
    const [first, second] = await Promise.all([
      statuses(world.studentA.client, activity.id, 3),
      statuses(world.studentB.client, activity.id, 3),
    ]);
    expect(first).toEqual(["resumed", "resumed", "started"]);
    expect(second).toEqual(["resumed", "resumed", "started"]);
    const rows = await readAttempts(activity.id);
    expect(rows.map((row) => row.attempt_no)).toEqual([1, 1]);
    expect(new Set(rows.map((row) => row.student_id)).size).toBe(2);
  });
});

describe("attempt_paper", () => {
  it("attempt_paper: open with exactly the paper keys, and questions with no key in any form", async () => {
    const { activity, attemptId, questionIds } = await openQuiz({ timeLimitMin: 15 });
    const { result, error } = await attemptPaper(world.studentA.client, attemptId);
    expect(error).toBeNull();
    expect(Object.keys(result!).sort()).toEqual(
      ["status", "activity_id", "attempt_no", "expires_at", "now", "questions", "answers"].sort(),
    );
    expect(result).toMatchObject({ status: "open", activity_id: activity.id, attempt_no: 1, answers: {} });
    expect(Date.parse(result!.expires_at as string)).toBe(Date.parse((await readAttempt(attemptId)).expires_at!));
    expect(Math.abs(Date.now() - Date.parse(result!.now as string))).toBeLessThan(60_000);

    const questions = result!.questions as unknown as PaperQuestion[];
    expect(questions.map((question) => question.id)).toEqual(questionIds);
    for (const question of questions) {
      expect(Object.keys(question).sort()).toEqual(["id", "kind", "options", "points", "position", "prompt"]);
    }
    expect(questions.map((question) => [question.kind, question.points, question.position])).toEqual([
      ["mcq", 2, 1],
      ["tf", 1, 2],
      ["ident", 3, 3],
    ]);
    expect(questions[0].options).toEqual(choiceOptions);
    expect(questions[1].options).toBeNull();
    expect(questions[2].options).toBeNull();
    const text = JSON.stringify(result);
    expect(text).not.toContain(marker);
    expect(text).not.toContain("second word");
    expect(text).not.toMatch(/"(accepted|is_correct|key|key_answers|score)"/);
  });

  it("attempt_paper: saved answers are returned and a cleared one is left out", async () => {
    const { attemptId, questionIds } = await openQuiz();
    await saveAnswer(world.studentA.client, attemptId, questionIds[0], 3);
    await saveAnswer(world.studentA.client, attemptId, questionIds[1], false);
    await saveAnswer(world.studentA.client, attemptId, questionIds[2], "my guess");
    expect((await attemptPaper(world.studentA.client, attemptId)).result?.answers).toEqual({
      [questionIds[0]]: 3,
      [questionIds[1]]: false,
      [questionIds[2]]: "my guess",
    });
    await saveAnswer(world.studentA.client, attemptId, questionIds[1], null);
    expect((await attemptPaper(world.studentA.client, attemptId)).result?.answers).toEqual({
      [questionIds[0]]: 3,
      [questionIds[2]]: "my guess",
    });
  });

  it("attempt_paper: not_found for another student, the teacher, another teacher, the outsider and an unknown id", async () => {
    const { attemptId } = await openQuiz();
    for (const actor of [world.studentB, world.teacher, world.otherTeacher, world.otherStudent, world.outsider]) {
      const { result, error } = await attemptPaper(actor.client, attemptId);
      expect(error).toBeNull();
      expect(result).toEqual({ status: "not_found" });
    }
    for (const unknown of [randomUUID(), null]) {
      expect((await attemptPaper(world.studentA.client, unknown as string)).result).toEqual({ status: "not_found" });
    }
  });

  it("attempt_paper: anon cannot call it", async () => {
    const { attemptId } = await openQuiz();
    const { result, error } = await attemptPaper(anon, attemptId);
    expect(error?.code).toBe(refused);
    expect(result).toBeNull();
  });

  it("attempt_paper: not_found for the owner once removed from the class", async () => {
    const student = await enrolledStudent(world.classroom.id, "removed");
    const { attemptId } = await openQuiz({}, student);
    expect((await attemptPaper(student.client, attemptId)).result?.status).toBe("open");
    await removeFromClass(world.teacher, world.classroom.id, student.id);
    expect((await attemptPaper(student.client, attemptId)).result).toEqual({ status: "not_found" });
  });

  it("attempt_paper: not_found for the owner while the quiz is not published", async () => {
    const created = await draftQuiz(world.teacher, world.classroom.id);
    const questionId = await addQuestion(world.teacher, created.id, specs[1]);
    const placed = await admin
      .from("quiz_attempts")
      .insert({ activity_id: created.id, student_id: world.studentA.id, attempt_no: 1, max_score: 1 })
      .select("id")
      .single();
    expect(placed.error).toBeNull();
    const attemptId = placed.data!.id;
    expect((await attemptPaper(world.studentA.client, attemptId)).result).toEqual({ status: "not_found" });
    expect((await saveAnswer(world.studentA.client, attemptId, questionId, true)).result).toEqual({ status: "refused" });
    expect((await submitAttempt(world.studentA.client, attemptId, { [questionId]: true })).result).toEqual({ status: "not_found" });
    expect((await attemptReview(world.studentA.client, attemptId)).result).toEqual({ status: "not_found" });
    const own = await world.studentA.client.from("quiz_attempts").select("id").eq("id", attemptId);
    expect(own.data).toEqual([]);
    expect(await readAnswers(attemptId)).toEqual([]);
    expect((await readAttempt(attemptId)).submitted_at).toBeNull();
  });

  it("attempt_paper: an attempt past its limit plus the grace comes back submitted and is graded by that call", async () => {
    const { activity, attemptId, questionIds } = await openQuiz({ timeLimitMin: 15 });
    await saveAnswer(world.studentA.client, attemptId, questionIds[0], 1);
    const expiredAt = secondsFromNow(-60);
    await setAttempt(attemptId, { expires_at: expiredAt });
    const { result, error } = await attemptPaper(world.studentA.client, attemptId);
    expect(error).toBeNull();
    expect(result).toEqual({ status: "submitted", activity_id: activity.id });
    const graded = await readAttempt(attemptId);
    expect(graded).toMatchObject({ score: 2, max_score: maxScore });
    expect(Date.parse(graded.submitted_at!)).toBe(Date.parse(expiredAt));
    expect(await readAnswers(attemptId)).toHaveLength(3);
    expect((await attemptPaper(world.studentA.client, attemptId)).result).toEqual({ status: "submitted", activity_id: activity.id });
    expect(await readAttempt(attemptId)).toEqual(graded);
  });

  it("attempt_paper: an attempt inside the grace is still open", async () => {
    const { attemptId } = await openQuiz({ timeLimitMin: 15 });
    await setAttempt(attemptId, { expires_at: secondsFromNow(-5) });
    expect((await attemptPaper(world.studentA.client, attemptId)).result?.status).toBe("open");
    expect((await readAttempt(attemptId)).submitted_at).toBeNull();
  });
});

describe("save_answer", () => {
  it("save_answer: saved for each kind, with expires_at and now in the reply", async () => {
    const { attemptId, questionIds } = await openQuiz({ timeLimitMin: 15 });
    const expiresAt = (await readAttempt(attemptId)).expires_at!;
    const sent: Json[] = [0, false, "  Revoke  "];
    for (const [index, answer] of sent.entries()) {
      const { result, error } = await saveAnswer(world.studentA.client, attemptId, questionIds[index], answer);
      expect(error).toBeNull();
      expect(Object.keys(result!).sort()).toEqual(["expires_at", "now", "status"]);
      expect(result!.status).toBe("saved");
      expect(Date.parse(result!.expires_at as string)).toBe(Date.parse(expiresAt));
      expect(Math.abs(Date.now() - Date.parse(result!.now as string))).toBeLessThan(60_000);
    }
    const rows = await readAnswers(attemptId);
    expect(rows).toHaveLength(3);
    expect(questionIds.map((id) => answerOf(rows, id)?.answer)).toEqual(sent);
    expect(rows.every((row) => row.is_correct === null)).toBe(true);
  });

  it("save_answer: a later save replaces the earlier one and null clears it", async () => {
    const { attemptId, questionIds } = await openQuiz();
    await saveAnswer(world.studentA.client, attemptId, questionIds[0], 0);
    await saveAnswer(world.studentA.client, attemptId, questionIds[0], 2);
    expect(answerOf(await readAnswers(attemptId), questionIds[0])?.answer).toBe(2);
    const cleared = await saveAnswer(world.studentA.client, attemptId, questionIds[0], null);
    expect(cleared.result?.status).toBe("saved");
    const rows = await readAnswers(attemptId);
    expect(rows).toHaveLength(1);
    expect(rows[0].answer).toBeNull();
  });

  it("save_answer: refused for a question of another quiz and an unknown question", async () => {
    const { attemptId } = await openQuiz();
    const other = await openQuiz();
    for (const questionId of [other.questionIds[1], randomUUID(), null]) {
      const { result, error } = await saveAnswer(world.studentA.client, attemptId, questionId as string, true);
      expect(error).toBeNull();
      expect(result?.status).toBe("refused");
    }
    expect(await readAnswers(attemptId)).toEqual([]);
    expect(await readAnswers(other.attemptId)).toEqual([]);
  });

  it("save_answer: refused for a wrong type per kind and text over 200 characters", async () => {
    const { attemptId, questionIds } = await openQuiz();
    const wrong: [number, Json][] = [
      [0, [1]],
      [0, choiceOptions.length],
      [0, -1],
      [0, 1.5],
      [0, "1"],
      [0, true],
      [0, { index: 1 }],
      [0, 100],
      [1, "true"],
      [1, 1],
      [1, [true]],
      [1, 0],
      [2, 7],
      [2, true],
      [2, [marker]],
      [2, { text: marker }],
      [2, "a".repeat(201)],
      [2, "a".repeat(1_000_000)],
    ];
    for (const [index, answer] of wrong) {
      const { result, error } = await saveAnswer(world.studentA.client, attemptId, questionIds[index], answer);
      expect(error).toBeNull();
      expect(result?.status).toBe("refused");
    }
    expect(await readAnswers(attemptId)).toEqual([]);
    const longest = await saveAnswer(world.studentA.client, attemptId, questionIds[2], "a".repeat(200));
    expect(longest.result?.status).toBe("saved");
    const last = await saveAnswer(world.studentA.client, attemptId, questionIds[0], choiceOptions.length - 1);
    expect(last.result?.status).toBe("saved");
  });

  it("save_answer: a refused save keeps the answer saved before it", async () => {
    const { attemptId, questionIds } = await openQuiz();
    await saveAnswer(world.studentA.client, attemptId, questionIds[1], true);
    expect((await saveAnswer(world.studentA.client, attemptId, questionIds[1], "false")).result?.status).toBe("refused");
    expect(answerOf(await readAnswers(attemptId), questionIds[1])?.answer).toBe(true);
  });

  it("save_answer: refused for another student's attempt, the teacher and an unknown attempt", async () => {
    const { attemptId, questionIds } = await openQuiz();
    for (const actor of [world.studentB, world.teacher, world.otherTeacher, world.otherStudent]) {
      const { result, error } = await saveAnswer(actor.client, attemptId, questionIds[1], true);
      expect(error).toBeNull();
      expect(result).toEqual({ status: "refused" });
    }
    expect((await saveAnswer(world.studentA.client, randomUUID(), questionIds[1], true)).result).toEqual({ status: "refused" });
    expect(await readAnswers(attemptId)).toEqual([]);
  });

  it("save_answer: refused for the owner once removed from the class, and anon cannot call it", async () => {
    const student = await enrolledStudent(world.classroom.id, "removed");
    const { attemptId, questionIds } = await openQuiz({}, student);
    await removeFromClass(world.teacher, world.classroom.id, student.id);
    expect((await saveAnswer(student.client, attemptId, questionIds[1], true)).result).toEqual({ status: "refused" });
    const asAnon = await saveAnswer(anon, attemptId, questionIds[1], true);
    expect(asAnon.error?.code).toBe(refused);
    expect(await readAnswers(attemptId)).toEqual([]);
  });

  it("save_answer: submitted after submit, and nothing changes", async () => {
    const { attemptId, questionIds } = await submittedQuiz({}, (ids) => ({ [ids[1]]: false }));
    const before = await readAnswers(attemptId);
    const { result, error } = await saveAnswer(world.studentA.client, attemptId, questionIds[1], true);
    expect(error).toBeNull();
    expect(result?.status).toBe("submitted");
    expect(await readAnswers(attemptId)).toEqual(before);
    expect((await readAttempt(attemptId)).score).toBe(0);
  });

  it("save_answer: saved 10 seconds after the expiry and late 20 seconds after it", async () => {
    const { attemptId, questionIds } = await openQuiz({ timeLimitMin: 15 });
    await setAttempt(attemptId, { expires_at: secondsFromNow(-10) });
    const inGrace = await saveAnswer(world.studentA.client, attemptId, questionIds[1], true);
    expect(inGrace.result?.status).toBe("saved");
    const expiredAt = secondsFromNow(-20);
    await setAttempt(attemptId, { expires_at: expiredAt });
    const late = await saveAnswer(world.studentA.client, attemptId, questionIds[1], false);
    expect(late.error).toBeNull();
    expect(late.result?.status).toBe("late");
    expect(Date.parse(late.result!.expires_at as string)).toBe(Date.parse(expiredAt));
    expect(Date.parse(late.result!.now as string)).toBeGreaterThan(Date.parse(expiredAt));
    const lateNew = await saveAnswer(world.studentA.client, attemptId, questionIds[0], 1);
    expect(lateNew.result?.status).toBe("late");
    const rows = await readAnswers(attemptId);
    expect(rows).toHaveLength(1);
    expect(rows[0].answer).toBe(true);
  });
});

describe("submit_attempt", () => {
  it("submit_attempt: grades the saved answers plus the ones sent", async () => {
    const { activity, attemptId, questionIds } = await openQuiz();
    await saveAnswer(world.studentA.client, attemptId, questionIds[0], 1);
    await saveAnswer(world.studentA.client, attemptId, questionIds[1], false);
    const { result, error } = await submitAttempt(world.studentA.client, attemptId, {
      [questionIds[1]]: true,
      [questionIds[2]]: `  ${marker.toLowerCase()} `,
    });
    expect(error).toBeNull();
    expect(result).toEqual({ status: "submitted", activity_id: activity.id, score: maxScore, max_score: maxScore });
    const attempt = await readAttempt(attemptId);
    expect(attempt).toMatchObject({ score: maxScore, max_score: maxScore, expires_at: null });
    expect(Math.abs(Date.now() - Date.parse(attempt.submitted_at!))).toBeLessThan(60_000);
    const rows = await readAnswers(attemptId);
    expect(rows).toHaveLength(3);
    expect(rows.every((row) => row.is_correct === true)).toBe(true);
  });

  it("submit_attempt: a partly right paper gets the points of the right questions only", async () => {
    const { attemptId, questionIds } = await openQuiz();
    const { result } = await submitAttempt(world.studentA.client, attemptId, {
      [questionIds[0]]: 0,
      [questionIds[1]]: true,
      [questionIds[2]]: "second  WORD",
    });
    expect(result).toMatchObject({ score: 4, max_score: maxScore });
    const rows = await readAnswers(attemptId);
    expect(questionIds.map((id) => answerOf(rows, id)?.is_correct)).toEqual([false, true, true]);
  });

  it("submit_attempt: a row exists for every question afterwards, blanks marked wrong", async () => {
    const { attemptId, questionIds } = await openQuiz();
    await saveAnswer(world.studentA.client, attemptId, questionIds[1], true);
    await saveAnswer(world.studentA.client, attemptId, questionIds[1], null);
    const { result } = await submitAttempt(world.studentA.client, attemptId, {});
    expect(result).toMatchObject({ score: 0, max_score: maxScore });
    const rows = await readAnswers(attemptId);
    expect(rows.map((row) => row.question_id).sort()).toEqual([...questionIds].sort());
    expect(rows.every((row) => row.answer === null && row.is_correct === false)).toBe(true);
  });

  it("submit_attempt: answers of the wrong type or for another quiz are ignored and the score never passes the maximum", async () => {
    const other = await quiz();
    const { attemptId, questionIds } = await openQuiz();
    await saveAnswer(world.studentA.client, attemptId, questionIds[1], true);
    const { result, error } = await submitAttempt(world.studentA.client, attemptId, {
      [questionIds[0]]: [1],
      [questionIds[1]]: "true",
      [questionIds[2]]: "a".repeat(5000),
      [other.questionIds[0]]: 1,
      [other.questionIds[1]]: true,
      [other.questionIds[2]]: marker,
      [randomUUID()]: true,
      "not-an-id": 1,
      score: 999,
      max_score: 1,
    });
    expect(error).toBeNull();
    expect(result).toMatchObject({ status: "submitted", score: 1, max_score: maxScore });
    const rows = await readAnswers(attemptId);
    expect(rows).toHaveLength(3);
    expect(questionIds.map((id) => [answerOf(rows, id)?.answer, answerOf(rows, id)?.is_correct])).toEqual([
      [null, false],
      [true, true],
      [null, false],
    ]);
    const stored = await admin.from("quiz_attempt_answers").select("attempt_id").in("question_id", other.questionIds);
    expect(stored.data).toEqual([]);
  });

  it("submit_attempt: answers that are not an object are ignored and the saved ones still count", async () => {
    const shapes: Json[] = [[1, true, marker], marker, 5, true, null];
    for (const shape of shapes) {
      const { attemptId, questionIds } = await openQuiz();
      await saveAnswer(world.studentA.client, attemptId, questionIds[0], 1);
      const { result, error } = await submitAttempt(world.studentA.client, attemptId, shape);
      expect(error).toBeNull();
      expect(result).toMatchObject({ status: "submitted", score: 2, max_score: maxScore });
      expect(await readAnswers(attemptId)).toHaveLength(3);
    }
  });

  it("submit_attempt: calling twice returns the same score and changes nothing, also with different answers", async () => {
    const { attemptId, questionIds } = await openQuiz();
    const first = await submitAttempt(world.studentA.client, attemptId, { [questionIds[1]]: true });
    expect(first.result).toMatchObject({ score: 1, max_score: maxScore });
    const attempt = await readAttempt(attemptId);
    const rows = await readAnswers(attemptId);
    const again = await submitAttempt(world.studentA.client, attemptId, { [questionIds[1]]: true });
    expect(again.result).toEqual(first.result);
    const cheated = await submitAttempt(world.studentA.client, attemptId, perfect(questionIds));
    expect(cheated.error).toBeNull();
    expect(cheated.result).toEqual(first.result);
    expect(await readAttempt(attemptId)).toEqual(attempt);
    expect(await readAnswers(attemptId)).toEqual(rows);
  });

  it("submit_attempt: two submits at once store one result", async () => {
    const { attemptId, questionIds } = await openQuiz();
    const [right, wrong] = await Promise.all([
      submitAttempt(world.studentA.client, attemptId, perfect(questionIds)),
      submitAttempt(world.studentA.client, attemptId, {}),
    ]);
    expect(right.error).toBeNull();
    expect(wrong.error).toBeNull();
    expect(right.result).toEqual(wrong.result);
    const attempt = await readAttempt(attemptId);
    expect([0, maxScore]).toContain(attempt.score);
    expect(right.result?.score).toBe(attempt.score);
    const rows = await readAnswers(attemptId);
    expect(rows).toHaveLength(3);
    expect(rows.every((row) => row.is_correct === (attempt.score === maxScore))).toBe(true);
  });

  it("submit_attempt: a save racing a submit is either graded or refused, never half", async () => {
    const { activity, questionIds } = await quiz({ attemptLimit: 6 });
    for (let round = 0; round < 6; round += 1) {
      const attemptId = await startedAttempt(world.studentA.client, activity.id);
      const [saved, submitted] = await Promise.all([
        saveAnswer(world.studentA.client, attemptId, questionIds[0], 1),
        submitAttempt(world.studentA.client, attemptId, {}),
      ]);
      expect(submitted.result?.status).toBe("submitted");
      expect(["saved", "submitted"]).toContain(saved.result?.status);
      const counted = saved.result?.status === "saved";
      const row = answerOf(await readAnswers(attemptId), questionIds[0]);
      expect(row).toMatchObject({ answer: counted ? 1 : null, is_correct: counted });
      expect((await readAttempt(attemptId)).score).toBe(counted ? 2 : 0);
    }
  });

  it("submit_attempt: after the limit plus the grace the sent answers do not count but the ones saved in time do", async () => {
    const { attemptId, questionIds } = await openQuiz({ timeLimitMin: 15 });
    await saveAnswer(world.studentA.client, attemptId, questionIds[1], true);
    const expiredAt = secondsFromNow(-60);
    await setAttempt(attemptId, { expires_at: expiredAt });
    const { result, error } = await submitAttempt(world.studentA.client, attemptId, perfect(questionIds));
    expect(error).toBeNull();
    expect(result).toMatchObject({ status: "submitted", score: 1, max_score: maxScore });
    const rows = await readAnswers(attemptId);
    expect(questionIds.map((id) => [answerOf(rows, id)?.answer, answerOf(rows, id)?.is_correct])).toEqual([
      [null, false],
      [true, true],
      [null, false],
    ]);
    const attempt = await readAttempt(attemptId);
    expect(Date.parse(attempt.submitted_at!)).toBe(Date.parse(expiredAt));
  });

  it("submit_attempt: a late submit cannot replace an answer saved in time", async () => {
    const { attemptId, questionIds } = await openQuiz({ timeLimitMin: 15 });
    await saveAnswer(world.studentA.client, attemptId, questionIds[1], false);
    await setAttempt(attemptId, { expires_at: secondsFromNow(-16) });
    const { result } = await submitAttempt(world.studentA.client, attemptId, { [questionIds[1]]: true });
    expect(result).toMatchObject({ score: 0 });
    expect(answerOf(await readAnswers(attemptId), questionIds[1])).toMatchObject({ answer: false, is_correct: false });
  });

  it("submit_attempt: inside the grace the sent answers count and submitted_at is capped at expires_at", async () => {
    const { attemptId, questionIds } = await openQuiz({ timeLimitMin: 15 });
    const expiredAt = secondsFromNow(-5);
    await setAttempt(attemptId, { expires_at: expiredAt });
    const { result } = await submitAttempt(world.studentA.client, attemptId, perfect(questionIds));
    expect(result).toMatchObject({ score: maxScore, max_score: maxScore });
    expect(Date.parse((await readAttempt(attemptId)).submitted_at!)).toBe(Date.parse(expiredAt));
  });

  it("submit_attempt: before the expiry submitted_at is the submit time", async () => {
    const { attemptId } = await openQuiz({ timeLimitMin: 15 });
    await submitAttempt(world.studentA.client, attemptId);
    const attempt = await readAttempt(attemptId);
    expect(Date.parse(attempt.submitted_at!)).toBeLessThan(Date.parse(attempt.expires_at!));
    expect(Date.parse(attempt.submitted_at!)).toBeGreaterThanOrEqual(Date.parse(attempt.started_at));
  });

  it("submit_attempt: not_found for another student, the teacher, a removed owner and an unknown id", async () => {
    const student = await enrolledStudent(world.classroom.id, "removed");
    const { attemptId, questionIds } = await openQuiz({}, student);
    for (const actor of [world.studentA, world.teacher, world.otherTeacher, world.otherStudent]) {
      const { result, error } = await submitAttempt(actor.client, attemptId, perfect(questionIds));
      expect(error).toBeNull();
      expect(result).toEqual({ status: "not_found" });
    }
    expect((await submitAttempt(student.client, randomUUID(), {})).result).toEqual({ status: "not_found" });
    await removeFromClass(world.teacher, world.classroom.id, student.id);
    expect((await submitAttempt(student.client, attemptId, perfect(questionIds))).result).toEqual({ status: "not_found" });
    expect(await readAttempt(attemptId)).toMatchObject({ submitted_at: null, score: null });
    expect(await readAnswers(attemptId)).toEqual([]);
  });

  it("submit_attempt: anon cannot call it", async () => {
    const { attemptId } = await openQuiz();
    const { result, error } = await submitAttempt(anon, attemptId, {});
    expect(error?.code).toBe(refused);
    expect(result).toBeNull();
    expect((await readAttempt(attemptId)).submitted_at).toBeNull();
  });
});

describe("direct writes to attempts and answers", () => {
  let activityId: string;
  let attemptId: string;
  let questionIds: string[];
  let openId: string;

  const attemptPatches: Record<string, unknown>[] = [
    { score: maxScore },
    { max_score: 1 },
    { submitted_at: new Date().toISOString() },
    { started_at: new Date().toISOString() },
    { expires_at: secondsFromNow(86400) },
    { attempt_no: 9 },
    { answers_seen_at: null },
    { student_id: randomUUID() },
    { activity_id: randomUUID() },
  ];
  const answerPatches: Record<string, unknown>[] = [
    { is_correct: true },
    { answer: 1 },
    { saved_at: new Date().toISOString() },
    { question_id: randomUUID() },
  ];

  function writers(): [string, Client][] {
    return [
      ["the student", world.studentA.client],
      ["another student", world.studentB.client],
      ["the teacher", world.teacher.client],
      ["another teacher", world.otherTeacher.client],
      ["anon", anon],
    ];
  }

  beforeAll(async () => {
    const made = await submittedQuiz({ attemptLimit: 3 }, (ids) => ({ [ids[1]]: false }));
    activityId = made.activity.id;
    attemptId = made.attemptId;
    questionIds = made.questionIds;
    openId = await startedAttempt(world.studentA.client, activityId);
    await saveAnswer(world.studentA.client, openId, questionIds[1], false);
  });

  it("direct writes: update of any column of quiz_attempts is refused for everyone", async () => {
    const before = [await readAttempt(attemptId), await readAttempt(openId)];
    for (const [, client] of writers()) {
      for (const patch of attemptPatches) {
        for (const target of [attemptId, openId]) {
          const { data, error } = await client.from("quiz_attempts").update(patch as never).eq("id", target).select("id");
          expect(error?.code).toBe(refused);
          expect(data).toBeNull();
        }
      }
    }
    expect([await readAttempt(attemptId), await readAttempt(openId)]).toEqual(before);
  });

  it("direct writes: update of any column of quiz_attempt_answers is refused for everyone", async () => {
    const before = [await readAnswers(attemptId), await readAnswers(openId)];
    for (const [, client] of writers()) {
      for (const patch of answerPatches) {
        for (const target of [attemptId, openId]) {
          const { data, error } = await client
            .from("quiz_attempt_answers")
            .update(patch as never)
            .eq("attempt_id", target)
            .select("attempt_id");
          expect(error?.code).toBe(refused);
          expect(data).toBeNull();
        }
      }
    }
    expect([await readAnswers(attemptId), await readAnswers(openId)]).toEqual(before);
  });

  it("direct writes: insert and upsert into quiz_attempts are refused for everyone", async () => {
    const row = { activity_id: activityId, student_id: world.studentA.id, attempt_no: 3, max_score: maxScore };
    const graded = { ...row, score: maxScore, submitted_at: new Date().toISOString() };
    for (const [, client] of writers()) {
      for (const sent of [row, graded]) {
        expect((await client.from("quiz_attempts").insert(sent)).error?.code).toBe(refused);
        expect((await client.from("quiz_attempts").upsert({ ...sent, id: attemptId })).error?.code).toBe(refused);
        const merged = await client
          .from("quiz_attempts")
          .upsert({ ...sent, attempt_no: 1 }, { onConflict: "activity_id,student_id,attempt_no" });
        expect(merged.error?.code).toBe(refused);
      }
    }
    expect(await readAttempts(activityId, world.studentA.id)).toHaveLength(2);
    expect((await readAttempt(attemptId)).score).toBe(0);
  });

  it("direct writes: insert and upsert into quiz_attempt_answers are refused for everyone", async () => {
    const before = [await readAnswers(attemptId), await readAnswers(openId)];
    for (const [, client] of writers()) {
      for (const target of [attemptId, openId]) {
        const row = { attempt_id: target, question_id: questionIds[0], answer: 1, is_correct: true };
        expect((await client.from("quiz_attempt_answers").insert(row)).error?.code).toBe(refused);
        expect((await client.from("quiz_attempt_answers").upsert(row)).error?.code).toBe(refused);
        const merged = await client
          .from("quiz_attempt_answers")
          .upsert({ ...row, question_id: questionIds[1] }, { onConflict: "attempt_id,question_id" });
        expect(merged.error?.code).toBe(refused);
      }
    }
    expect([await readAnswers(attemptId), await readAnswers(openId)]).toEqual(before);
  });

  it("direct writes: delete from quiz_attempts and quiz_attempt_answers is refused for everyone", async () => {
    const answers = [await readAnswers(attemptId), await readAnswers(openId)];
    for (const [, client] of writers()) {
      for (const target of [attemptId, openId]) {
        expect((await client.from("quiz_attempts").delete().eq("id", target)).error?.code).toBe(refused);
        expect((await client.from("quiz_attempt_answers").delete().eq("attempt_id", target)).error?.code).toBe(refused);
      }
    }
    expect(await readAttempts(activityId, world.studentA.id)).toHaveLength(2);
    expect([await readAnswers(attemptId), await readAnswers(openId)]).toEqual(answers);
  });
});

describe("attempt_review", () => {
  it("attempt_review: open before submit", async () => {
    const { activity, attemptId } = await openQuiz({ showAnswers: "after_submit" });
    const { result, error } = await attemptReview(world.studentA.client, attemptId);
    expect(error).toBeNull();
    expect(result).toEqual({ status: "open", activity_id: activity.id });
    expect((await readAttempt(attemptId)).answers_seen_at).toBeNull();
  });

  it("attempt_review: with never, the score and the student's answers but no is_correct and no accepted", async () => {
    const { activity, attemptId, questionIds } = await submittedQuiz({}, (ids) => ({ [ids[0]]: 0, [ids[1]]: true, [ids[2]]: "a guess" }));
    const { result, error } = await attemptReview(world.studentA.client, attemptId);
    expect(error).toBeNull();
    expect(result).toMatchObject({
      status: "submitted",
      activity_id: activity.id,
      attempt_no: 1,
      score: 1,
      max_score: maxScore,
      reveal: false,
    });
    expect(Date.parse(result!.submitted_at as string)).toBe(Date.parse((await readAttempt(attemptId)).submitted_at!));
    const listed = items(result);
    expect(listed.map((item) => item.question_id)).toEqual(questionIds);
    expect(listed.map((item) => item.answer)).toEqual([0, true, "a guess"]);
    for (const item of listed) {
      expect(Object.keys(item).sort()).toEqual(["answer", "kind", "options", "points", "position", "prompt", "question_id"]);
    }
    const text = JSON.stringify(result);
    expect(text).not.toContain(marker);
    expect(text).not.toContain("is_correct");
    expect(text).not.toContain("accepted");
    expect((await readAttempt(attemptId)).answers_seen_at).toBeNull();
  });

  it("attempt_review: with after_submit, is_correct and accepted are present and the reveal is stamped once", async () => {
    const { attemptId } = await submittedQuiz({ showAnswers: "after_submit" }, (ids) => ({ [ids[0]]: 0, [ids[1]]: true }));
    const { result, error } = await attemptReview(world.studentA.client, attemptId);
    expect(error).toBeNull();
    expect(result).toMatchObject({ status: "submitted", reveal: true, score: 1, max_score: maxScore });
    const listed = items(result);
    expect(listed.map((item) => item.is_correct)).toEqual([false, true, false]);
    expect(listed.map((item) => item.accepted)).toEqual([1, true, [marker, "second word"]]);
    expect(listed.map((item) => item.answer)).toEqual([0, true, null]);
    const seenAt = (await readAttempt(attemptId)).answers_seen_at;
    expect(seenAt).not.toBeNull();
    await attemptReview(world.studentA.client, attemptId);
    expect((await readAttempt(attemptId)).answers_seen_at).toBe(seenAt);
  });

  it("attempt_review: with after_due, hidden before the due time, hidden within a minute after it and shown later", async () => {
    const { activity, attemptId } = await submittedQuiz({ showAnswers: "after_due", dueAt: secondsFromNow(3600), attemptLimit: 2 });
    const hiddenCases = [undefined, secondsFromNow(-1), secondsFromNow(-30), secondsFromNow(-50)];
    for (const dueAt of hiddenCases) {
      if (dueAt) await setActivity(activity.id, { due_at: dueAt });
      const { result } = await attemptReview(world.studentA.client, attemptId);
      expect(result).toMatchObject({ status: "submitted", reveal: false, score: maxScore });
      expect(JSON.stringify(result)).not.toContain("accepted");
      expect(JSON.stringify(result)).not.toContain("is_correct");
      expect((await readAttempt(attemptId)).answers_seen_at).toBeNull();
    }
    await setActivity(activity.id, { due_at: secondsFromNow(-90) });
    const { result } = await attemptReview(world.studentA.client, attemptId);
    expect(result).toMatchObject({ status: "submitted", reveal: true });
    expect(items(result).map((item) => item.is_correct)).toEqual([true, true, true]);
    expect(items(result)[2].accepted).toEqual([marker, "second word"]);
    expect((await readAttempt(attemptId)).answers_seen_at).not.toBeNull();
  });

  it("attempt_review: with after_due, hidden while the caller has another attempt open", async () => {
    const { activity, attemptId } = await submittedQuiz({ showAnswers: "after_due", dueAt: secondsFromNow(3600), attemptLimit: 2 });
    const second = await startedAttempt(world.studentA.client, activity.id);
    await setActivity(activity.id, { due_at: secondsFromNow(-90) });
    expect((await readAttempt(second)).submitted_at).toBeNull();
    for (const target of [attemptId, second]) {
      const { result } = await attemptReview(world.studentA.client, target);
      expect(result?.reveal ?? false).toBe(false);
      expect(JSON.stringify(result)).not.toContain("accepted");
      expect(JSON.stringify(result)).not.toContain("second word");
    }
    expect((await readAttempt(attemptId)).answers_seen_at).toBeNull();

    expect((await attemptPaper(world.studentA.client, second)).result?.status).toBe("submitted");
    const shown = await attemptReview(world.studentA.client, attemptId);
    expect(shown.result).toMatchObject({ reveal: true });
    expect(items(shown.result)[2].accepted).toEqual([marker, "second word"]);
  });

  it("attempt_review: another student's open attempt does not hide the answers", async () => {
    const { activity, attemptId } = await submittedQuiz({ showAnswers: "after_due", dueAt: secondsFromNow(3600) });
    await startedAttempt(world.studentB.client, activity.id);
    await setActivity(activity.id, { due_at: secondsFromNow(-90) });
    expect((await attemptReview(world.studentA.client, attemptId)).result).toMatchObject({ reveal: true });
  });

  it("attempt_review: after a reveal under after_due, start_attempt answers limit even when the teacher reopens the quiz and raises the limit", async () => {
    const { activity, attemptId } = await submittedQuiz({ showAnswers: "after_due", dueAt: secondsFromNow(3600), attemptLimit: 2 });
    await setActivity(activity.id, { due_at: secondsFromNow(-90) });
    expect((await startAttempt(world.studentA.client, activity.id)).result).toEqual({ status: "closed" });
    expect((await attemptReview(world.studentA.client, attemptId)).result).toMatchObject({ reveal: true });

    const reopened = await world.teacher.client
      .from("activities")
      .update({ due_at: secondsFromNow(3600), attempt_limit: 10 })
      .eq("id", activity.id)
      .select("id");
    expect(reopened.error).toBeNull();
    expect(reopened.data).toHaveLength(1);
    for (let call = 0; call < 2; call += 1) {
      expect((await startAttempt(world.studentA.client, activity.id)).result).toEqual({ status: "limit" });
    }
    expect(await readAttempts(activity.id, world.studentA.id)).toHaveLength(1);
    expect((await startAttempt(world.studentB.client, activity.id)).result?.status).toBe("started");
  });

  it("attempt_review: after a reveal under after_submit, start_attempt answers limit even when the teacher hides answers and raises the limit", async () => {
    const { activity, attemptId } = await submittedQuiz({ showAnswers: "after_submit" });
    expect((await attemptReview(world.studentA.client, attemptId)).result).toMatchObject({ reveal: true });
    const raised = await world.teacher.client
      .from("activities")
      .update({ show_answers: "never", attempt_limit: 5 })
      .eq("id", activity.id)
      .select("id");
    expect(raised.error).toBeNull();
    expect(raised.data).toHaveLength(1);
    expect((await startAttempt(world.studentA.client, activity.id)).result).toEqual({ status: "limit" });
    expect(await readAttempts(activity.id, world.studentA.id)).toHaveLength(1);
  });

  it("attempt_review: without a reveal a raised limit gives a new attempt", async () => {
    const { activity, attemptId } = await submittedQuiz();
    expect((await attemptReview(world.studentA.client, attemptId)).result).toMatchObject({ reveal: false });
    expect((await startAttempt(world.studentA.client, activity.id)).result).toEqual({ status: "limit" });
    await world.teacher.client.from("activities").update({ attempt_limit: 2 }).eq("id", activity.id);
    expect((await startAttempt(world.studentA.client, activity.id)).result?.status).toBe("started");
  });

  it("attempt_review: not_found for another student, the teacher, a removed owner and an unknown id", async () => {
    const student = await enrolledStudent(world.classroom.id, "removed");
    const made = await openQuiz({ showAnswers: "after_submit" }, student);
    await submitAttempt(student.client, made.attemptId, perfect(made.questionIds));
    for (const actor of [world.studentA, world.teacher, world.otherTeacher, world.otherStudent]) {
      const { result, error } = await attemptReview(actor.client, made.attemptId);
      expect(error).toBeNull();
      expect(result).toEqual({ status: "not_found" });
    }
    expect((await attemptReview(student.client, randomUUID())).result).toEqual({ status: "not_found" });
    await removeFromClass(world.teacher, world.classroom.id, student.id);
    expect((await attemptReview(student.client, made.attemptId)).result).toEqual({ status: "not_found" });
    expect((await readAttempt(made.attemptId)).answers_seen_at).toBeNull();
  });

  it("attempt_review: anon cannot call it", async () => {
    const { attemptId } = await submittedQuiz({ showAnswers: "after_submit" });
    const { result, error } = await attemptReview(anon, attemptId);
    expect(error?.code).toBe(refused);
    expect(result).toBeNull();
  });
});

describe("row access to attempts and answers", () => {
  let activityId: string;
  let ownId: string;
  let otherId: string;
  let removed: Actor;
  let removedId: string;

  beforeAll(async () => {
    const made = await submittedQuiz({ showAnswers: "after_submit" });
    activityId = made.activity.id;
    ownId = made.attemptId;
    otherId = await startedAttempt(world.studentB.client, activityId);
    await saveAnswer(world.studentB.client, otherId, made.questionIds[1], true);
    removed = await enrolledStudent(world.classroom.id, "removed");
    removedId = await startedAttempt(removed.client, activityId);
    await submitAttempt(removed.client, removedId, perfect(made.questionIds));
    await removeFromClass(world.teacher, world.classroom.id, removed.id);
    await attemptReview(world.studentA.client, ownId);
  });

  it("quiz_attempts select: a student sees only own attempts, with the score", async () => {
    expect(await visibleAttempts(world.studentA.client, activityId)).toEqual([ownId]);
    expect(await visibleAttempts(world.studentB.client, activityId)).toEqual([otherId]);
    const own = await world.studentA.client.from("quiz_attempts").select("score, max_score").eq("id", ownId).single();
    expect(own.data).toEqual({ score: maxScore, max_score: maxScore });
    const byId = await world.studentA.client.from("quiz_attempts").select("id").in("id", [otherId, removedId]);
    expect(byId.error).toBeNull();
    expect(byId.data).toEqual([]);
  });

  it("quiz_attempts select: the class teacher sees every attempt of the class, including a removed student's", async () => {
    expect(await visibleAttempts(world.teacher.client, activityId)).toEqual([ownId, otherId, removedId].sort());
  });

  it("quiz_attempts select: another teacher, a student of another class, the outsider and a removed student see none", async () => {
    for (const actor of [world.otherTeacher, world.otherStudent, world.outsider, removed]) {
      expect(await visibleAttempts(actor.client, activityId)).toEqual([]);
      const all = await actor.client.from("quiz_attempts").select("id").in("id", [ownId, otherId, removedId]);
      expect(all.data).toEqual([]);
    }
  });

  it("quiz_attempts select: anon is refused", async () => {
    const { data, error } = await anon.from("quiz_attempts").select("id").eq("activity_id", activityId);
    expect(error?.code).toBe(refused);
    expect(data).toBeNull();
  });

  it("quiz_attempt_answers select: zero rows for every student, including their own, also after a reveal", async () => {
    for (const actor of [world.studentA, world.studentB, world.otherStudent, world.outsider, removed]) {
      const { data, error, count } = await actor.client
        .from("quiz_attempt_answers")
        .select("attempt_id, question_id, answer, is_correct", { count: "exact" })
        .in("attempt_id", [ownId, otherId, removedId]);
      expect(error).toBeNull();
      expect(data).toEqual([]);
      expect(count).toBe(0);
    }
  });

  it("quiz_attempt_answers select: rows for the class teacher only", async () => {
    const taught = await world.teacher.client
      .from("quiz_attempt_answers")
      .select("attempt_id, is_correct")
      .in("attempt_id", [ownId, otherId, removedId]);
    expect(taught.error).toBeNull();
    expect(taught.data).toHaveLength(7);
    const other = await world.otherTeacher.client.from("quiz_attempt_answers").select("attempt_id").in("attempt_id", [ownId, otherId]);
    expect(other.error).toBeNull();
    expect(other.data).toEqual([]);
    const asAnon = await anon.from("quiz_attempt_answers").select("attempt_id").eq("attempt_id", ownId);
    expect(asAnon.error?.code).toBe(refused);
  });

  it("quiz_questions select: rows for the class teacher, zero rows for students and another teacher", async () => {
    const taught = await world.teacher.client.from("quiz_questions").select("id").eq("activity_id", activityId);
    expect(taught.data).toHaveLength(3);
    for (const actor of [world.studentA, world.otherStudent, world.outsider, world.otherTeacher, removed]) {
      const { data, error } = await actor.client.from("quiz_questions").select("id, prompt, options").eq("activity_id", activityId);
      expect(error).toBeNull();
      expect(data).toEqual([]);
    }
    expect((await readActivity(activityId))?.points).toBe(maxScore);
  });
});
