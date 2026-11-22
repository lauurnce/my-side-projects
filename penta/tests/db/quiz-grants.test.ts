import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  addQuiz,
  admin,
  anon,
  createRouteWorld,
  draftQuiz,
  quizRow,
  readActivity,
  readAnswers,
  readAttempt,
  readQuestions,
  refused,
  removeCreatedUsers,
  startedAttempt,
  submitAttempt,
  type Client,
} from "./helpers";

type Role = "anon" | "student" | "teacher";
type Action = "select" | "insert" | "update" | "delete";
type Outcome = "refused" | "rows" | "zero rows" | "written";
type Table = "activities" | "quiz_questions" | "quiz_answer_keys" | "quiz_attempts" | "quiz_attempt_answers";
type Reply = { data: unknown[] | null; error: { code?: string; message?: string } | null };

const roles: Role[] = ["anon", "student", "teacher"];
const actions: Action[] = ["select", "insert", "update", "delete"];
const closed: Record<Action, Outcome> = { select: "refused", insert: "refused", update: "refused", delete: "refused" };
const readOnly = (select: Outcome): Record<Action, Outcome> => ({ ...closed, select });

const expected: Record<Table, Record<Role, Record<Action, Outcome>>> = {
  activities: {
    anon: closed,
    student: { select: "rows", insert: "refused", update: "zero rows", delete: "zero rows" },
    teacher: { select: "rows", insert: "written", update: "written", delete: "written" },
  },
  quiz_questions: { anon: closed, student: readOnly("zero rows"), teacher: readOnly("rows") },
  quiz_answer_keys: { anon: closed, student: closed, teacher: closed },
  quiz_attempts: { anon: closed, student: readOnly("rows"), teacher: readOnly("rows") },
  quiz_attempt_answers: { anon: closed, student: readOnly("zero rows"), teacher: readOnly("rows") },
};

const cases = (Object.keys(expected) as Table[]).flatMap((table) =>
  roles.flatMap((role) => actions.map((action) => [table, role, action, expected[table][role][action]] as const)),
);

let world: Awaited<ReturnType<typeof createRouteWorld>>;
let activityId: string;
let spareId: string;
let questionIds: string[];
let attemptId: string;

function clientOf(role: Role): Client {
  if (role === "anon") return anon;
  return role === "student" ? world.studentA.client : world.teacher.client;
}

function filterOf(table: Table): [string, string] {
  if (table === "activities") return ["id", activityId];
  if (table === "quiz_questions") return ["activity_id", activityId];
  if (table === "quiz_answer_keys") return ["question_id", questionIds[0]];
  if (table === "quiz_attempts") return ["id", attemptId];
  return ["attempt_id", attemptId];
}

function rowOf(table: Table): Record<string, unknown> {
  if (table === "activities") return quizRow(world.classroom.id, { title: "Granted insert" });
  if (table === "quiz_questions") return { activity_id: spareId, kind: "tf", prompt: "Inserted directly.", points: 1, position: 9 };
  if (table === "quiz_answer_keys") return { question_id: questionIds[1], answers: false };
  if (table === "quiz_attempts") return { activity_id: activityId, student_id: world.studentB.id, attempt_no: 1, max_score: 2 };
  return { attempt_id: attemptId, question_id: questionIds[1], answer: true, is_correct: true };
}

function patchOf(table: Table): Record<string, unknown> {
  if (table === "activities") return { title: "Granted update" };
  if (table === "quiz_questions") return { prompt: "Rewritten directly.", points: 100 };
  if (table === "quiz_answer_keys") return { answers: false };
  if (table === "quiz_attempts") return { score: 2 };
  return { is_correct: true };
}

async function attempt(table: Table, role: Role, action: Action): Promise<Reply> {
  const from = clientOf(role).from(table as "activities");
  const [column, value] = filterOf(table);
  const returning = table === "quiz_answer_keys" ? "question_id" : column;
  if (action === "select") return from.select(returning).eq(column, value);
  if (action === "insert") return from.insert(rowOf(table) as never).select(returning);
  if (action === "update") return from.update(patchOf(table) as never).eq(column, value).select(returning);
  const [deleteColumn, deleteValue] = table === "activities" ? ["id", spareId] : [column, value];
  return from.delete().eq(deleteColumn, deleteValue).select(returning);
}

async function snapshot() {
  const keys = await admin.from("quiz_answer_keys").select("question_id, answers").in("question_id", questionIds).order("question_id");
  return {
    questions: await readQuestions(activityId),
    keys: keys.data,
    attempt: await readAttempt(attemptId),
    answers: await readAnswers(attemptId),
    attempts: (await admin.from("quiz_attempts").select("id").eq("activity_id", activityId)).data,
  };
}

beforeAll(async () => {
  world = await createRouteWorld();
  const made = await addQuiz(world.teacher, world.classroom.id, [
    { kind: "tf", key: true },
    { kind: "tf", key: true },
  ]);
  activityId = made.activity.id;
  questionIds = made.questionIds;
  attemptId = await startedAttempt(world.studentA.client, activityId);
  await submitAttempt(world.studentA.client, attemptId, { [questionIds[0]]: false });
});

afterAll(removeCreatedUsers);

describe("quiz table grants by behaviour", () => {
  it.each(cases)("grants: %s as %s, %s is %s", async (table, role, action, outcome) => {
    spareId = (await draftQuiz(world.teacher, world.classroom.id)).id;
    const before = await snapshot();
    const { data, error } = await attempt(table, role, action);

    if (outcome === "refused") {
      expect(error?.code).toBe(refused);
      expect(data).toBeNull();
    } else {
      expect(error).toBeNull();
      expect(data!.length > 0).toBe(outcome !== "zero rows");
    }

    const closedByGrant = outcome === "refused" && !(table === "activities" && role === "student");
    if (closedByGrant) expect(error?.message).toContain("permission denied");

    expect(await snapshot()).toEqual(before);
    const spareLeft = await readActivity(spareId);
    const deleted = table === "activities" && action === "delete" && outcome === "written";
    expect(spareLeft === null).toBe(deleted);
    const title = (await readActivity(activityId))?.title;
    const renamed = table === "activities" && action === "update" && outcome === "written";
    expect(title === "Granted update").toBe(renamed);
    if (renamed) await admin.from("activities").update({ title: "Grants" }).eq("id", activityId);
    if (!deleted) await admin.from("activities").delete().eq("id", spareId);
  });

  it("grants: quiz_answer_keys answers permission denied and never an empty list, for all three roles", async () => {
    for (const role of roles) {
      const client = clientOf(role);
      const listed = await client.from("quiz_answer_keys").select("*");
      expect(listed.error?.code).toBe(refused);
      expect(listed.error?.message).toContain("permission denied for table quiz_answer_keys");
      expect(listed.data).toBeNull();
      expect(listed.data).not.toEqual([]);
      const column = await client.from("quiz_answer_keys").select("question_id").limit(0);
      expect(column.error?.code).toBe(refused);
    }
    const served = await admin.from("quiz_answer_keys").select("question_id").in("question_id", questionIds);
    expect(served.data).toHaveLength(2);
  });

  it("grants: columns outside the allow list of activities are refused for a teacher", async () => {
    const insertOnly = ["class_id"];
    const neither = ["id", "type", "points", "created_by", "created_at"];
    for (const column of [...insertOnly, ...neither]) {
      const patch = { [column]: column === "points" ? 1 : column === "type" ? "quiz" : randomUUID() };
      const { error } = await world.teacher.client.from("activities").update(patch as never).eq("id", activityId);
      expect(error?.code).toBe(refused);
      expect(error?.message).toContain("permission denied");
    }
    for (const column of [...neither, "published_at"]) {
      const value = column === "points" ? 1 : column === "type" ? "quiz" : column.endsWith("_at") ? "2026-01-01" : randomUUID();
      const { error } = await world.teacher.client
        .from("activities")
        .insert({ ...quizRow(world.classroom.id), [column]: value } as never);
      expect(error?.code).toBe(refused);
      expect(error?.message).toContain("permission denied");
    }
  });
});

describe("quiz function grants by behaviour", () => {
  const unknown = randomUUID();
  const calls: [string, Record<string, unknown>][] = [
    [
      "save_quiz_question",
      {
        target_activity: unknown,
        target_question: null,
        question_kind: "tf",
        question_prompt: "A role can own a table.",
        question_options: null,
        question_points: 1,
        key_answers: true,
      },
    ],
    ["delete_quiz_question", { target_question: unknown }],
    ["move_quiz_question", { target_question: unknown, step: 1 }],
    ["quiz_keys", { target_activity: unknown }],
    ["rekey_quiz_question", { target_question: unknown, key_answers: true }],
    ["settle_attempts", { target_activity: unknown }],
    ["start_attempt", { target_activity: unknown }],
    ["attempt_paper", { target_attempt: unknown }],
    ["save_answer", { target_attempt: unknown, target_question: unknown, answer: true }],
    ["submit_attempt", { target_attempt: unknown, answers: {} }],
    ["attempt_review", { target_attempt: unknown }],
    ["grade_check", { question_kind: "tf", key_answers: true, answer: true }],
  ];

  function call(client: Client, name: string, args: Record<string, unknown>) {
    return client.rpc(name as "grade_check", args as never);
  }

  it.each(calls)("grants: anon cannot execute %s", async (name, args) => {
    const { data, error } = await call(anon, name, args);
    expect(error?.code).toBe(refused);
    expect(error?.message).toContain("permission denied");
    expect(data).toBeNull();
  });

  it.each(calls.slice(0, -1))("grants: a student and a teacher can execute %s", async (name, args) => {
    for (const client of [world.studentA.client, world.teacher.client]) {
      const { error } = await call(client, name, args);
      expect(error).toBeNull();
    }
  });

  it("grants: grade_check is refused for every signed-in user and served to the service role", async () => {
    const args = calls[calls.length - 1][1];
    for (const actor of [world.studentA, world.studentB, world.outsider, world.otherStudent, world.teacher, world.otherTeacher]) {
      const { data, error } = await call(actor.client, "grade_check", args);
      expect(error?.code).toBe(refused);
      expect(error?.message).toContain("permission denied for function grade_check");
      expect(data).toBeNull();
    }
    expect((await call(admin, "grade_check", args)).data).toBe(true);
  });
});
