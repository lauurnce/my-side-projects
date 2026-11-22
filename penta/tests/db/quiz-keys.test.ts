import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Json } from "../../src/lib/database.types";
import {
  addQuiz,
  admin,
  anon,
  attemptPaper,
  attemptReview,
  createRouteWorld,
  refused,
  removeCreatedUsers,
  saveAnswer,
  saveQuestion,
  secondsFromNow,
  startAttempt,
  startedAttempt,
  submitAttempt,
  type Client,
  type QuestionSpec,
} from "./helpers";

type Reply = { data: unknown; error: unknown; count?: number | null; status?: number };
type Quiz = { activityId: string; questionIds: string[]; attemptId: string };

const markers = ["ZEBRA-KEY-7781", "QUOKKA-KEY-3304", "NARWHAL-KEY-9126"];
const hiddenNames = ["accepted", "is_correct", "key", "key_answers", "answers_seen_at"];
const specs: QuestionSpec[] = [
  { kind: "ident", prompt: "Name the first animal.", key: [markers[0], markers[1]], points: 2 },
  { kind: "ident", prompt: "Name the second animal.", key: [markers[2]], points: 2 },
  { kind: "mcq", prompt: "Which statement gives a privilege?", options: ["REVOKE", "DROP", "GRANT"], key: 2, points: 1 },
  { kind: "tf", prompt: "A role can own a table.", key: true, points: 1 },
];

let world: Awaited<ReturnType<typeof createRouteWorld>>;
let hidden: Quiz;
let afterDue: Quiz;

function propertyNames(value: unknown, found = new Set<string>()): Set<string> {
  if (Array.isArray(value)) value.forEach((item) => propertyNames(item, found));
  else if (value && typeof value === "object") {
    for (const [name, inner] of Object.entries(value)) {
      found.add(name);
      propertyNames(inner, found);
    }
  }
  return found;
}

function expectNoMarker(reply: Reply | unknown) {
  const text = JSON.stringify(reply);
  for (const marker of markers) expect(text).not.toContain(marker);
  expect(text.toLowerCase()).not.toContain("zebra");
}

function expectNoKey(reply: Reply | unknown) {
  expectNoMarker(reply);
  const names = propertyNames(reply);
  for (const name of hiddenNames) expect(names.has(name)).toBe(false);
}

function expectRefused(reply: Reply) {
  expect((reply.error as { code?: string } | null)?.code).toBe(refused);
  expect(reply.data).toBeNull();
  expectNoMarker(reply);
}

function readers(): [string, Client][] {
  return [
    ["a student in the class", world.studentA.client],
    ["a second student in the class", world.studentB.client],
    ["a student of another class", world.otherStudent.client],
    ["the outsider", world.outsider.client],
    ["anon", anon],
  ];
}

function everyone(): [string, Client][] {
  return [...readers(), ["the class teacher", world.teacher.client], ["another teacher", world.otherTeacher.client]];
}

async function quizWithAttempt(options: Parameters<typeof addQuiz>[3]): Promise<Quiz> {
  const made = await addQuiz(world.teacher, world.classroom.id, specs, options);
  const attemptId = await startedAttempt(world.studentA.client, made.activity.id);
  return { activityId: made.activity.id, questionIds: made.questionIds, attemptId };
}

async function keysStillThere(quiz: Quiz) {
  const { data, error } = await admin.from("quiz_answer_keys").select("question_id, answers").in("question_id", quiz.questionIds);
  expect(error).toBeNull();
  expect(data).toHaveLength(specs.length);
  expect(JSON.stringify(data)).toContain(markers[0]);
}

beforeAll(async () => {
  world = await createRouteWorld();
  hidden = await quizWithAttempt({ attemptLimit: 3 });
  afterDue = await quizWithAttempt({ attemptLimit: 3, showAnswers: "after_due", dueAt: secondsFromNow(3600) });
});

afterAll(removeCreatedUsers);

describe("quiz_answer_keys through the table", () => {
  it.each([0, 1, 2, 3, 4, 5, 6])("quiz_answer_keys table: reader %i is refused on every read", async (index) => {
    const [, client] = everyone()[index];
    const table = () => client.from("quiz_answer_keys");
    const reads: Reply[] = [
      await table().select("*"),
      await table().select("answers"),
      await table().select("question_id"),
      await table().select("*").eq("question_id", hidden.questionIds[0]),
      await table().select("*").in("question_id", hidden.questionIds),
      await table().select("question_id").contains("answers", JSON.stringify([markers[0]])),
      await table().select("question_id").eq("answers", "true"),
      await table().select("*").limit(1),
      await table().select("*").order("answers"),
      await table().select("*").eq("question_id", hidden.questionIds[0]).maybeSingle(),
      await table().select("*", { count: "exact" }),
    ];
    for (const reply of reads) expectRefused(reply);
  });

  it.each([0, 1, 2, 3, 4, 5, 6])("quiz_answer_keys table: reader %i gets no count", async (index) => {
    const [, client] = everyone()[index];
    for (const mode of ["exact", "planned", "estimated"] as const) {
      const head = await client.from("quiz_answer_keys").select("*", { count: mode, head: true });
      expect(head.count).toBeNull();
      expect(head.error).not.toBeNull();
      expect([401, 403]).toContain(head.status);
      const filtered = await client
        .from("quiz_answer_keys")
        .select("*", { count: mode, head: true })
        .contains("answers", JSON.stringify([markers[0]]));
      expect(filtered.count).toBeNull();
      expect([401, 403]).toContain(filtered.status);
    }
  });

  it.each([0, 1, 2, 3, 4, 5, 6])("quiz_answer_keys table: writer %i is refused on insert, update, upsert and delete", async (index) => {
    const [, client] = everyone()[index];
    const table = () => client.from("quiz_answer_keys");
    const row = { question_id: hidden.questionIds[3], answers: false };
    const writes: Reply[] = [
      await table().insert(row).select("*"),
      await table().insert(row),
      await table().upsert(row).select("*"),
      await table().upsert(row, { onConflict: "question_id", ignoreDuplicates: true }).select("*"),
      await table().update({ answers: false }).eq("question_id", hidden.questionIds[3]).select("*"),
      await table().update({ answers: ["open"] }).neq("question_id", randomUUID()).select("*"),
      await table().delete().eq("question_id", hidden.questionIds[3]).select("*"),
      await table().delete().neq("question_id", randomUUID()),
    ];
    for (const reply of writes) expectRefused(reply);
    await keysStillThere(hidden);
  });
});

describe("quiz_answer_keys through embedded selects", () => {
  it.each([0, 1, 2, 3, 4, 5, 6])("quiz_answer_keys embeds: reader %i gets a refusal for every embed of the key table", async (index) => {
    const [, client] = everyone()[index];
    const embeds: Reply[] = [
      await client.from("quiz_questions").select("id, quiz_answer_keys(*)").eq("activity_id", hidden.activityId),
      await client.from("quiz_questions").select("id, quiz_answer_keys!inner(answers)"),
      await client.from("quiz_questions").select("id, keys:quiz_answer_keys(answers)").eq("id", hidden.questionIds[0]),
      await client.from("activities").select("id, quiz_questions(id, quiz_answer_keys(*))").eq("id", hidden.activityId),
      await client.from("activities").select("id, quiz_questions!inner(quiz_answer_keys!inner(answers))"),
      await client
        .from("quiz_attempts")
        .select("id, activities(quiz_questions(quiz_answer_keys(answers)))")
        .eq("id", hidden.attemptId),
      await client
        .from("quiz_attempt_answers")
        .select("attempt_id, quiz_questions(quiz_answer_keys(answers))")
        .eq("attempt_id", hidden.attemptId),
    ];
    for (const reply of embeds) {
      expect(reply.error).not.toBeNull();
      expect(reply.data).toBeNull();
      expectNoMarker(reply);
    }
  });

  it.each([0, 1, 2, 3, 4])("quiz_answer_keys embeds: reader %i gets no key data from the other embeds", async (index) => {
    const [, client] = readers()[index];
    const embeds: Reply[] = [
      await client.from("activities").select("*, quiz_questions(*)").eq("id", hidden.activityId),
      await client.from("activities").select("*, quiz_questions(*), quiz_attempts(*, quiz_attempt_answers(*))"),
      await client.from("quiz_attempts").select("*, quiz_attempt_answers(*)").eq("activity_id", hidden.activityId),
      await client.from("quiz_attempts").select("id, quiz_attempt_answers(is_correct, quiz_questions(*))"),
      await client.from("quiz_questions").select("*, quiz_attempt_answers(*)").eq("activity_id", hidden.activityId),
      await client.from("quiz_questions").select("*, activities(*)"),
      await client.from("quiz_attempt_answers").select("*, quiz_questions(*), quiz_attempts(*)"),
    ];
    for (const reply of embeds) {
      expectNoMarker(reply);
      const names = propertyNames(reply.data);
      expect(names.has("accepted")).toBe(false);
      expect(JSON.stringify(reply.data ?? null)).not.toMatch(/"is_correct":(true|false)/);
      expect(JSON.stringify(reply.data ?? null)).not.toContain("Name the first animal.");
    }
  });
});

describe("quiz_answer_keys through functions", () => {
  it("quiz_answer_keys functions: the whole run of a student under never carries no key", async () => {
    const student = world.studentB.client;
    const started = await startAttempt(student, hidden.activityId);
    expect(started.result?.status).toBe("started");
    const attemptId = started.result!.attempt_id as string;
    const [first, second, choice, truth] = hidden.questionIds;
    const replies: unknown[] = [
      started,
      await startAttempt(student, hidden.activityId),
      await attemptPaper(student, attemptId),
      await saveAnswer(student, attemptId, first, "a wrong guess"),
      await saveAnswer(student, attemptId, choice, 0),
      await saveAnswer(student, attemptId, truth, false),
      await saveAnswer(student, attemptId, second, null),
      await attemptPaper(student, attemptId),
      await attemptReview(student, attemptId),
      await submitAttempt(student, attemptId, { [first]: "another wrong guess", [truth]: false }),
      await attemptPaper(student, attemptId),
      await saveAnswer(student, attemptId, first, "too late"),
      await submitAttempt(student, attemptId, {}),
      await attemptReview(student, attemptId),
      await startAttempt(student, hidden.activityId),
    ];
    for (const reply of replies) expectNoKey(reply);
    const review = await attemptReview(student, attemptId);
    expect(review.result).toMatchObject({ status: "submitted", reveal: false, score: 0 });
  });

  it("quiz_answer_keys functions: the run under after_due before the due time carries no key", async () => {
    const student = world.studentA.client;
    const [first, , choice] = afterDue.questionIds;
    const replies: unknown[] = [
      await attemptPaper(student, afterDue.attemptId),
      await saveAnswer(student, afterDue.attemptId, choice, 1),
      await attemptReview(student, afterDue.attemptId),
      await submitAttempt(student, afterDue.attemptId, { [first]: "not it" }),
      await attemptReview(student, afterDue.attemptId),
      await startAttempt(student, afterDue.activityId),
      await attemptReview(student, afterDue.attemptId),
    ];
    for (const reply of replies) expectNoKey(reply);
    expect((await attemptReview(student, afterDue.attemptId)).result).toMatchObject({ reveal: false });
  });

  it.each([0, 1, 2, 3, 4])("quiz_answer_keys functions: reader %i gets no key from any function, also for ids that are not theirs", async (index) => {
    const [, client] = readers()[index];
    const [first, , choice, truth] = hidden.questionIds;
    const replies: unknown[] = [
      await client.rpc("quiz_keys", { target_activity: hidden.activityId }),
      await client.rpc("quiz_keys", { target_activity: afterDue.activityId }),
      await saveQuestion(client, hidden.activityId, specs[0]),
      await saveQuestion(client, hidden.activityId, { ...specs[0], key: ["mine"] }, first),
      await client.rpc("rekey_quiz_question", { target_question: first, key_answers: ["mine"] }),
      await client.rpc("rekey_quiz_question", { target_question: truth, key_answers: false }),
      await client.rpc("settle_attempts", { target_activity: hidden.activityId }),
      await client.rpc("delete_quiz_question", { target_question: first }),
      await client.rpc("move_quiz_question", { target_question: choice, step: -1 }),
      await attemptPaper(client, hidden.attemptId),
      await attemptReview(client, hidden.attemptId),
      await saveAnswer(client, hidden.attemptId, first, "guess"),
      await submitAttempt(client, hidden.attemptId, { [first]: "guess" }),
    ];
    for (const reply of replies) expectNoKey(reply);
    await keysStillThere(hidden);
    await keysStillThere(afterDue);
  });

  it("quiz_answer_keys functions: quiz_keys gives rows to the class teacher only", async () => {
    const taught = await world.teacher.client.rpc("quiz_keys", { target_activity: hidden.activityId });
    expect(JSON.stringify(taught.data)).toContain(markers[0]);
    for (const [, client] of readers().slice(0, 4)) {
      const { data, error } = await client.rpc("quiz_keys", { target_activity: hidden.activityId });
      expect(error).toBeNull();
      expect(data).toEqual([]);
    }
    const other = await world.otherTeacher.client.rpc("quiz_keys", { target_activity: hidden.activityId });
    expect(other.data).toEqual([]);
  });

  it("quiz_answer_keys functions: grade_check is not callable by a student, a teacher or anon", async () => {
    for (const [, client] of everyone()) {
      const reply = await client.rpc("grade_check", { question_kind: "ident", key_answers: [markers[0]], answer: markers[0] });
      expect(reply.error?.code).toBe(refused);
      expect(reply.data).toBeNull();
    }
    const served = await admin.rpc("grade_check", { question_kind: "ident", key_answers: [markers[0]], answer: markers[0] });
    expect(served.data).toBe(true);
  });

  it("quiz_answer_keys functions: private helpers are not reachable through the API", async () => {
    const names = ["is_correct", "grade_attempt", "clean_key", "normalize_answer", "settle_expired", "store_answer", "lock_own_attempt"];
    for (const [, client] of everyone()) {
      for (const name of names) {
        const reply = await client.rpc(name as "grade_check", { target: hidden.attemptId } as never);
        expect(reply.error).not.toBeNull();
        expect(reply.data).toBeNull();
        expectNoMarker(reply);
      }
    }
  });
});

describe("quiz_answer_keys through error messages", () => {
  it("quiz_answer_keys errors: a wrong answer, a malformed answer and a bad question id never echo a key", async () => {
    const student = world.studentA.client;
    const attemptId = await startedAttempt(student, hidden.activityId);
    const [first, second, choice, truth] = hidden.questionIds;
    const malformed: Json[] = [{ nested: { deep: [1, 2, 3] } }, [[]], "a".repeat(5000), 1e308, -0, ""];
    const replies: unknown[] = [
      await saveAnswer(student, attemptId, first, "wrong"),
      await saveAnswer(student, attemptId, choice, 99),
      await saveAnswer(student, attemptId, truth, "true"),
      await saveAnswer(student, attemptId, "not-a-uuid", "wrong"),
      await saveAnswer(student, "not-a-uuid", first, "wrong"),
      await saveAnswer(student, attemptId, randomUUID(), "wrong"),
      await student.rpc("save_answer", { target_attempt: attemptId, target_question: second } as never),
      await student.rpc("save_answer", { target_attempt: attemptId, target_question: second, answer: "x", extra: 1 } as never),
      await student.rpc("submit_attempt", { target_attempt: attemptId } as never),
      await submitAttempt(student, "not-a-uuid", {}),
      await attemptPaper(student, "not-a-uuid"),
      await attemptReview(student, "not-a-uuid"),
      await startAttempt(student, "not-a-uuid"),
      await student.rpc("quiz_keys", { target_activity: "not-a-uuid" }),
      await student.rpc("rekey_quiz_question", { target_question: "not-a-uuid", key_answers: [] }),
    ];
    for (const answer of malformed) replies.push(await saveAnswer(student, attemptId, first, answer));
    replies.push(await submitAttempt(student, attemptId, { [first]: { nested: true }, [choice]: "GRANT", [truth]: [true] }));
    for (const reply of replies) expectNoKey(reply);
  });

  it("quiz_answer_keys errors: a constraint error on the activity does not echo a key", async () => {
    const reply = await world.teacher.client
      .from("activities")
      .update({ published_at: null })
      .eq("id", hidden.activityId)
      .select("id");
    expect(reply.error?.message).toContain("activity_has_attempts");
    expectNoMarker(reply);
  });
});

describe("quiz_answer_keys in the API description", () => {
  it("quiz_answer_keys openapi: the document served to a student does not list the key table", async () => {
    const session = await world.studentA.client.auth.getSession();
    const token = session.data.session!.access_token;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    for (const bearer of [token, anonKey]) {
      const response = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/`, {
        headers: { apikey: anonKey, Authorization: `Bearer ${bearer}` },
      });
      const text = await response.text();
      if (!response.ok) {
        expect([401, 403, 404]).toContain(response.status);
        continue;
      }
      expect(text).not.toContain("quiz_answer_keys");
      expect(text).not.toContain("grade_check");
      for (const marker of markers) expect(text).not.toContain(marker);
    }
  });
});
