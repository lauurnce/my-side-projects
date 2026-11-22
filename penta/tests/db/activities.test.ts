import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  activityColumns,
  addDeck,
  addLesson,
  addModule,
  addQuestion,
  addQuiz,
  addUnfinishedDeck,
  admin,
  anon,
  checkFailed,
  createRouteWorld,
  draftQuiz,
  enrolledStudent,
  foreignKeyFailed,
  publishQuiz,
  quizRow,
  readActivity,
  readAttempt,
  readDeck,
  refused,
  removeCreatedUsers,
  removeFromClass,
  saveQuestion,
  secondsFromNow,
  startedAttempt,
  submitAttempt,
  type ActivityPatch,
  type Actor,
  type QuestionSpec,
  type QuizOptions,
} from "./helpers";

const trueQuestion: QuestionSpec = { kind: "tf", key: true, prompt: "A role can own a table." };

let world: Awaited<ReturnType<typeof createRouteWorld>>;
let ownLesson: Awaited<ReturnType<typeof addLesson>>;
let foreignLesson: Awaited<ReturnType<typeof addLesson>>;

function insertAs(actor: Actor, classId: string, extra: Record<string, unknown> = {}, options: QuizOptions = {}) {
  return actor.client
    .from("activities")
    .insert({ ...quizRow(classId, options), ...extra } as never)
    .select(activityColumns);
}

function updateAs(actor: Actor, activityId: string, patch: Record<string, unknown>) {
  return actor.client
    .from("activities")
    .update(patch as ActivityPatch)
    .eq("id", activityId)
    .select(activityColumns);
}

function draft(options: QuizOptions = {}) {
  return draftQuiz(world.teacher, world.classroom.id, options);
}

function published(options: QuizOptions = {}, questions: QuestionSpec[] = [trueQuestion]) {
  return addQuiz(world.teacher, world.classroom.id, questions, options);
}

async function visibleIds(actor: Actor, ids: string[]) {
  const { data, error } = await actor.client.from("activities").select("id").in("id", ids);
  expect(error).toBeNull();
  return data!.map((row) => row.id).sort();
}

function near(value: string | null, expected: number, toleranceMs = 60_000) {
  expect(value).not.toBeNull();
  expect(Math.abs(Date.parse(value!) - expected)).toBeLessThan(toleranceMs);
}

beforeAll(async () => {
  world = await createRouteWorld();
  const ownModule = await addModule(world.classroom.id, "Week 1");
  const foreignModule = await addModule(world.otherClassroom.id, "Week 1");
  ownLesson = await addLesson(ownModule.id, "Roles", true);
  foreignLesson = await addLesson(foreignModule.id, "Indexes", true);
});

afterAll(removeCreatedUsers);

describe("activities select", () => {
  let draftId: string;
  let publishedId: string;

  beforeAll(async () => {
    draftId = (await draft()).id;
    publishedId = (await published()).activity.id;
  });

  it("activities select: the class teacher sees drafts and published quizzes", async () => {
    expect(await visibleIds(world.teacher, [draftId, publishedId])).toEqual([draftId, publishedId].sort());
  });

  it("activities select: an enrolled student sees only the published quiz", async () => {
    expect(await visibleIds(world.studentA, [draftId, publishedId])).toEqual([publishedId]);
    const byId = await world.studentA.client.from("activities").select("id").eq("id", draftId);
    expect(byId.error).toBeNull();
    expect(byId.data).toEqual([]);
  });

  it("activities select: a student of another class, the outsider and another teacher see nothing, also by id", async () => {
    for (const actor of [world.otherStudent, world.outsider, world.otherTeacher]) {
      expect(await visibleIds(actor, [draftId, publishedId])).toEqual([]);
      const byId = await actor.client.from("activities").select(activityColumns).eq("id", publishedId);
      expect(byId.error).toBeNull();
      expect(byId.data).toEqual([]);
      const listed = await actor.client.from("activities").select("id").eq("class_id", world.classroom.id);
      expect(listed.data).toEqual([]);
    }
  });

  it("activities select: anon is refused, also by id", async () => {
    const listed = await anon.from("activities").select("id");
    expect(listed.error?.code).toBe(refused);
    expect(listed.data).toBeNull();
    const byId = await anon.from("activities").select("id").eq("id", publishedId);
    expect(byId.error?.code).toBe(refused);
    expect(byId.data).toBeNull();
  });

  it("activities select: a removed student sees nothing", async () => {
    const student = await enrolledStudent(world.classroom.id, "removed");
    expect(await visibleIds(student, [draftId, publishedId])).toEqual([publishedId]);
    await removeFromClass(world.teacher, world.classroom.id, student.id);
    expect(await visibleIds(student, [draftId, publishedId])).toEqual([]);
  });
});

describe("activities insert", () => {
  it("activities insert: the teacher inserts with the allowed columns", async () => {
    const dueAt = secondsFromNow(3600);
    const { data, error } = await insertAs(world.teacher, world.classroom.id, {}, {
      title: "Roles check",
      instructions: "Read each question twice.",
      lessonId: ownLesson.id,
      dueAt,
      attemptLimit: 3,
      timeLimitMin: 20,
      showAnswers: "after_due",
    });
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
    expect(data![0]).toMatchObject({
      class_id: world.classroom.id,
      lesson_id: ownLesson.id,
      type: "quiz",
      title: "Roles check",
      instructions_md: "Read each question twice.",
      points: 0,
      published_at: null,
      requires_deck_id: null,
      attempt_limit: 3,
      time_limit_min: 20,
      show_answers: "after_due",
      created_by: world.teacher.id,
    });
    expect(Date.parse(data![0].due_at!)).toBe(Date.parse(dueAt));
  });

  it("activities insert: created_by is the caller", async () => {
    const created = await draft();
    expect(created.created_by).toBe(world.teacher.id);
    expect((await readActivity(created.id))?.created_by).toBe(world.teacher.id);
  });

  it("activities insert: published_at, points, type, created_by and created_at cannot be set", async () => {
    const forbidden: Record<string, unknown>[] = [
      { published_at: new Date().toISOString() },
      { points: 50 },
      { type: "upload" },
      { type: "quiz" },
      { created_by: world.otherTeacher.id },
      { created_by: world.teacher.id },
      { created_at: "2020-01-01T00:00:00Z" },
    ];
    for (const extra of forbidden) {
      const title = `Refused ${Object.keys(extra)[0]} ${Math.random()}`;
      const { data, error } = await insertAs(world.teacher, world.classroom.id, extra, { title });
      expect(error?.code).toBe(refused);
      expect(data).toBeNull();
      const stored = await admin.from("activities").select("id").eq("title", title);
      expect(stored.data).toEqual([]);
    }
  });

  it("activities insert: a student, the outsider and another teacher cannot insert into the class", async () => {
    for (const actor of [world.studentA, world.outsider, world.otherTeacher, world.otherStudent]) {
      const title = `Intruder ${actor.id}`;
      const { data, error } = await insertAs(actor, world.classroom.id, {}, { title });
      expect(error?.code).toBe(refused);
      expect(data).toBeNull();
      const stored = await admin.from("activities").select("id").eq("title", title);
      expect(stored.data).toEqual([]);
    }
  });

  it("activities insert: anon cannot insert", async () => {
    const { data, error } = await anon.from("activities").insert(quizRow(world.classroom.id)).select("id");
    expect(error?.code).toBe(refused);
    expect(data).toBeNull();
  });
});

describe("activities update", () => {
  it("activities update: the teacher changes the allowed columns", async () => {
    const created = await draft();
    const deck = await addDeck(world.classroom.id, world.teacher.id);
    const dueAt = secondsFromNow(7200);
    const { data, error } = await updateAs(world.teacher, created.id, {
      title: "Privileges check",
      instructions_md: "No notes.",
      lesson_id: ownLesson.id,
      requires_deck_id: deck.id,
      due_at: dueAt,
      attempt_limit: 4,
      time_limit_min: 45,
      show_answers: "after_due",
    });
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
    expect(data![0]).toMatchObject({
      title: "Privileges check",
      instructions_md: "No notes.",
      lesson_id: ownLesson.id,
      requires_deck_id: deck.id,
      attempt_limit: 4,
      time_limit_min: 45,
      show_answers: "after_due",
      class_id: world.classroom.id,
      created_by: world.teacher.id,
    });
    await admin.from("activities").delete().eq("id", created.id);
  });

  it("activities update: class_id, points, type, created_by, id and created_at are refused", async () => {
    const created = await draft();
    const forbidden: Record<string, unknown>[] = [
      { class_id: world.otherClassroom.id },
      { class_id: world.classroom.id },
      { points: 99 },
      { type: "upload" },
      { created_by: world.otherTeacher.id },
      { id: created.id },
      { created_at: "2020-01-01T00:00:00Z" },
    ];
    for (const patch of forbidden) {
      const { data, error } = await updateAs(world.teacher, created.id, patch);
      expect(error?.code).toBe(refused);
      expect(data).toBeNull();
    }
    expect(await readActivity(created.id)).toEqual(created);
  });

  it("activities update: another teacher, a student and the outsider change zero rows", async () => {
    const { activity } = await published();
    const before = await readActivity(activity.id);
    for (const actor of [world.otherTeacher, world.studentA, world.otherStudent, world.outsider]) {
      for (const patch of [{ title: "Taken over" }, { attempt_limit: 10 }, { due_at: null }, { published_at: null }]) {
        const { data, error } = await updateAs(actor, activity.id, patch);
        expect(error).toBeNull();
        expect(data).toEqual([]);
      }
    }
    expect(await readActivity(activity.id)).toEqual(before);
  });

  it("activities update: a student cannot set points on a quiz and anon cannot update at all", async () => {
    const { activity } = await published();
    const points = await updateAs(world.studentA, activity.id, { points: 0 });
    expect(points.error?.code).toBe(refused);
    const { data, error } = await anon.from("activities").update({ title: "Anon" }).eq("id", activity.id).select("id");
    expect(error?.code).toBe(refused);
    expect(data).toBeNull();
    expect((await readActivity(activity.id))?.title).toBe(activity.title);
  });
});

describe("activities publish", () => {
  it("activities publish: refused with no question", async () => {
    const created = await draft();
    const { data, error } = await publishQuiz(world.teacher.client, created.id);
    expect(error?.code).toBe(checkFailed);
    expect(error?.message).toContain("activity_not_ready");
    expect(data).toBeNull();
    expect((await readActivity(created.id))?.published_at).toBeNull();
  });

  it("activities publish: works with one question and stores the database time whatever is sent", async () => {
    for (const sent of ["2001-01-01T00:00:00Z", "2099-01-01T00:00:00Z"]) {
      const created = await draft();
      await addQuestion(world.teacher, created.id, trueQuestion);
      const { data, error } = await publishQuiz(world.teacher.client, created.id, sent);
      expect(error).toBeNull();
      expect(data).toHaveLength(1);
      near(data![0].published_at, Date.now());
    }
  });

  it("activities publish: publishing again keeps the first time", async () => {
    const { activity } = await published();
    const again = await publishQuiz(world.teacher.client, activity.id, "2031-05-05T05:05:05Z");
    expect(again.error).toBeNull();
    expect(again.data![0].published_at).toBe(activity.published_at);
    expect((await readActivity(activity.id))?.published_at).toBe(activity.published_at);
  });

  it("activities publish: refused again after the only question is deleted", async () => {
    const created = await draft();
    const questionId = await addQuestion(world.teacher, created.id, trueQuestion);
    expect((await world.teacher.client.rpc("delete_quiz_question", { target_question: questionId })).data).toBe("deleted");
    const { error } = await publishQuiz(world.teacher.client, created.id);
    expect(error?.code).toBe(checkFailed);
    expect(error?.message).toContain("activity_not_ready");
  });

  it("activities publish: unpublish works with no attempts", async () => {
    const { activity } = await published();
    const { data, error } = await updateAs(world.teacher, activity.id, { published_at: null });
    expect(error).toBeNull();
    expect(data![0].published_at).toBeNull();
    expect(await visibleIds(world.studentA, [activity.id])).toEqual([]);
  });

  it("activities publish: unpublish is refused once an attempt exists, open or submitted", async () => {
    const { activity } = await published({ attemptLimit: 2 });
    const attemptId = await startedAttempt(world.studentA.client, activity.id);
    const whileOpen = await updateAs(world.teacher, activity.id, { published_at: null });
    expect(whileOpen.error?.code).toBe(checkFailed);
    expect(whileOpen.error?.message).toContain("activity_has_attempts");
    await submitAttempt(world.studentA.client, attemptId);
    const afterSubmit = await updateAs(world.teacher, activity.id, { published_at: null });
    expect(afterSubmit.error?.code).toBe(checkFailed);
    expect(afterSubmit.error?.message).toContain("activity_has_attempts");
    expect((await readActivity(activity.id))?.published_at).toBe(activity.published_at);
  });
});

describe("activities constraints", () => {
  const dueSoon = () => secondsFromNow(3600);
  const cases: [label: string, options: () => QuizOptions][] = [
    ["after_submit with 2 attempts", () => ({ showAnswers: "after_submit", attemptLimit: 2 })],
    ["after_due with no due date", () => ({ showAnswers: "after_due", dueAt: null })],
    ["attempt limit 0", () => ({ attemptLimit: 0 })],
    ["attempt limit 11", () => ({ attemptLimit: 11 })],
    ["time limit 0", () => ({ timeLimitMin: 0 })],
    ["time limit 301", () => ({ timeLimitMin: 301 })],
    ["an empty title", () => ({ title: "" })],
    ["a title of spaces", () => ({ title: "   " })],
    ["a title of 161 characters", () => ({ title: "a".repeat(161) })],
    ["a title with a zero width space", () => ({ title: "Roles​check" })],
    ["a title with a direction override", () => ({ title: "Roles‮check" })],
    ["a title with a control character", () => ({ title: "Roles\u0007check" })],
    ["instructions of 10,001 characters", () => ({ instructions: "a".repeat(10001) })],
    ["an unknown show_answers value", () => ({ showAnswers: "always" as never, dueAt: dueSoon() })],
  ];

  it.each(cases)("activities constraints: insert refuses %s", async (_label, options) => {
    const { data, error } = await insertAs(world.teacher, world.classroom.id, {}, options());
    expect(error?.code).toBe(checkFailed);
    expect(data).toBeNull();
  });

  it("activities constraints: update refuses the same values", async () => {
    const created = await draft();
    const patches: Record<string, unknown>[] = [
      { show_answers: "after_submit", attempt_limit: 2 },
      { show_answers: "after_due" },
      { attempt_limit: 0 },
      { attempt_limit: 11 },
      { time_limit_min: 0 },
      { time_limit_min: 301 },
      { title: "" },
      { title: "a".repeat(161) },
      { title: "Roles​check" },
      { instructions_md: "a".repeat(10001) },
    ];
    for (const patch of patches) {
      const { data, error } = await updateAs(world.teacher, created.id, patch);
      expect(error?.code).toBe(checkFailed);
      expect(data).toBeNull();
    }
    expect(await readActivity(created.id)).toEqual(created);
  });

  it("activities constraints: the edge values are accepted", async () => {
    const accepted: QuizOptions[] = [
      { attemptLimit: 10, timeLimitMin: 300, title: "a".repeat(160), instructions: "a".repeat(10000) },
      { attemptLimit: 1, timeLimitMin: 1, showAnswers: "after_submit" },
      { attemptLimit: 2, showAnswers: "after_due", dueAt: dueSoon() },
    ];
    for (const options of accepted) {
      const { data, error } = await insertAs(world.teacher, world.classroom.id, {}, options);
      expect(error).toBeNull();
      expect(data).toHaveLength(1);
    }
  });

  it("activities constraints: removing the due date of an after_due quiz is refused", async () => {
    const created = await draft({ showAnswers: "after_due", dueAt: dueSoon() });
    const { error } = await updateAs(world.teacher, created.id, { due_at: null });
    expect(error?.code).toBe(checkFailed);
    const raised = await updateAs(world.teacher, (await draft({ showAnswers: "after_submit" })).id, { attempt_limit: 2 });
    expect(raised.error?.code).toBe(checkFailed);
  });
});

describe("activities links", () => {
  it("activities links: a lesson of another class is refused on insert and update", async () => {
    const inserted = await insertAs(world.teacher, world.classroom.id, {}, { lessonId: foreignLesson.id });
    expect(inserted.error?.code).toBe(checkFailed);
    expect(inserted.error?.message).toContain("activity_lesson_outside_class");
    const created = await draft();
    const updated = await updateAs(world.teacher, created.id, { lesson_id: foreignLesson.id });
    expect(updated.error?.code).toBe(checkFailed);
    expect(updated.error?.message).toContain("activity_lesson_outside_class");
    expect((await readActivity(created.id))?.lesson_id).toBeNull();
  });

  it("activities links: a deck of another class is refused on insert and update", async () => {
    const foreignDeck = await addDeck(world.otherClassroom.id, world.otherTeacher.id);
    const inserted = await insertAs(world.teacher, world.classroom.id, {}, { deckId: foreignDeck.id });
    expect(inserted.error?.code).toBe(checkFailed);
    expect(inserted.error?.message).toContain("activity_deck_outside_class");
    const created = await draft();
    const updated = await updateAs(world.teacher, created.id, { requires_deck_id: foreignDeck.id });
    expect(updated.error?.code).toBe(checkFailed);
    expect(updated.error?.message).toContain("activity_deck_outside_class");
    expect((await readActivity(created.id))?.requires_deck_id).toBeNull();
  });

  it("activities links: a deck that is not ready is refused", async () => {
    const unfinished = await addUnfinishedDeck(world.classroom.id, world.teacher.id);
    const inserted = await insertAs(world.teacher, world.classroom.id, {}, { deckId: unfinished.id });
    expect(inserted.error?.code).toBe(checkFailed);
    expect(inserted.error?.message).toContain("activity_deck_outside_class");
    const created = await draft();
    const updated = await updateAs(world.teacher, created.id, { requires_deck_id: unfinished.id });
    expect(updated.error?.code).toBe(checkFailed);
  });

  it("activities links: an unknown lesson or deck id is refused", async () => {
    const unknown = "00000000-0000-4000-8000-000000000000";
    expect((await insertAs(world.teacher, world.classroom.id, {}, { lessonId: unknown })).error?.code).toBe(checkFailed);
    expect((await insertAs(world.teacher, world.classroom.id, {}, { deckId: unknown })).error?.code).toBe(checkFailed);
  });

  it("activities links: a lesson and a ready deck of the same class are accepted", async () => {
    const deck = await addDeck(world.classroom.id, world.teacher.id);
    const { data, error } = await insertAs(world.teacher, world.classroom.id, {}, { lessonId: ownLesson.id, deckId: deck.id });
    expect(error).toBeNull();
    expect(data![0]).toMatchObject({ lesson_id: ownLesson.id, requires_deck_id: deck.id });
    await admin.from("activities").delete().eq("id", data![0].id);
  });

  it("activities links: deleting a deck that a quiz requires is refused", async () => {
    const deck = await addDeck(world.classroom.id, world.teacher.id);
    const created = await draft({ deckId: deck.id });
    const { error } = await admin.from("decks").delete().eq("id", deck.id);
    expect(error?.code).toBe(foreignKeyFailed);
    expect(await readDeck(deck.id)).not.toBeNull();
    await admin.from("activities").delete().eq("id", created.id);
    expect((await admin.from("decks").delete().eq("id", deck.id)).error).toBeNull();
  });
});

describe("activities with attempts", () => {
  it("activities time limit: a change is refused once an attempt exists and allowed before", async () => {
    const { activity } = await published({ timeLimitMin: 30 });
    const before = await updateAs(world.teacher, activity.id, { time_limit_min: 40 });
    expect(before.error).toBeNull();
    expect(before.data![0].time_limit_min).toBe(40);
    await startedAttempt(world.studentA.client, activity.id);
    for (const value of [10, 60, null]) {
      const { data, error } = await updateAs(world.teacher, activity.id, { time_limit_min: value });
      expect(error?.code).toBe(checkFailed);
      expect(error?.message).toContain("activity_has_attempts");
      expect(data).toBeNull();
    }
    const same = await updateAs(world.teacher, activity.id, { time_limit_min: 40, title: "Same limit" });
    expect(same.error).toBeNull();
    expect((await readActivity(activity.id))?.time_limit_min).toBe(40);
  });

  it("activities due date: moving it earlier, later and to null moves expires_at of an open attempt", async () => {
    const { activity } = await published({ timeLimitMin: 30, dueAt: secondsFromNow(3600) });
    const attemptId = await startedAttempt(world.studentA.client, activity.id);
    const started = await readAttempt(attemptId);
    const byLimit = Date.parse(started.started_at) + 30 * 60 * 1000;
    expect(Date.parse(started.expires_at!)).toBe(byLimit);

    const earlier = secondsFromNow(300);
    expect((await updateAs(world.teacher, activity.id, { due_at: earlier })).error).toBeNull();
    expect(Date.parse((await readAttempt(attemptId)).expires_at!)).toBe(Date.parse(earlier));

    const later = secondsFromNow(900);
    expect((await updateAs(world.teacher, activity.id, { due_at: later })).error).toBeNull();
    expect(Date.parse((await readAttempt(attemptId)).expires_at!)).toBe(Date.parse(later));

    expect((await updateAs(world.teacher, activity.id, { due_at: secondsFromNow(86400) })).error).toBeNull();
    expect(Date.parse((await readAttempt(attemptId)).expires_at!)).toBe(byLimit);

    expect((await updateAs(world.teacher, activity.id, { due_at: null })).error).toBeNull();
    expect(Date.parse((await readAttempt(attemptId)).expires_at!)).toBe(byLimit);
  });

  it("activities due date: with no time limit the open attempt follows the due date and loses it with null", async () => {
    const { activity } = await published();
    const attemptId = await startedAttempt(world.studentA.client, activity.id);
    expect((await readAttempt(attemptId)).expires_at).toBeNull();
    const due = secondsFromNow(600);
    expect((await updateAs(world.teacher, activity.id, { due_at: due })).error).toBeNull();
    expect(Date.parse((await readAttempt(attemptId)).expires_at!)).toBe(Date.parse(due));
    expect((await updateAs(world.teacher, activity.id, { due_at: null })).error).toBeNull();
    expect((await readAttempt(attemptId)).expires_at).toBeNull();
  });

  it("activities due date: closing the quiz now expires open attempts and leaves submitted ones alone", async () => {
    const { activity } = await published({ attemptLimit: 2 });
    const submittedId = await startedAttempt(world.studentA.client, activity.id);
    await submitAttempt(world.studentA.client, submittedId);
    const submitted = await readAttempt(submittedId);
    const openId = await startedAttempt(world.studentB.client, activity.id);
    const now = new Date().toISOString();
    expect((await updateAs(world.teacher, activity.id, { due_at: now })).error).toBeNull();
    expect(Date.parse((await readAttempt(openId)).expires_at!)).toBe(Date.parse(now));
    expect(await readAttempt(submittedId)).toEqual(submitted);
  });

  it("activities delete: works with no attempts and removes the questions", async () => {
    const { activity, questionIds } = await published();
    const { data, error } = await world.teacher.client.from("activities").delete().eq("id", activity.id).select("id");
    expect(error).toBeNull();
    expect(data).toEqual([{ id: activity.id }]);
    expect(await readActivity(activity.id)).toBeNull();
    const left = await admin.from("quiz_questions").select("id").in("id", questionIds);
    expect(left.data).toEqual([]);
    const keys = await admin.from("quiz_answer_keys").select("question_id").in("question_id", questionIds);
    expect(keys.data).toEqual([]);
  });

  it("activities delete: refused with attempts", async () => {
    const { activity } = await published();
    await startedAttempt(world.studentA.client, activity.id);
    const { data, error } = await world.teacher.client.from("activities").delete().eq("id", activity.id).select("id");
    expect(error?.code).toBe(foreignKeyFailed);
    expect(data).toBeNull();
    expect(await readActivity(activity.id)).not.toBeNull();
  });

  it("activities delete: another teacher, a student and the outsider delete zero rows and anon is refused", async () => {
    const { activity } = await published();
    for (const actor of [world.otherTeacher, world.studentA, world.outsider]) {
      const { data, error } = await actor.client.from("activities").delete().eq("id", activity.id).select("id");
      expect(error).toBeNull();
      expect(data).toEqual([]);
    }
    const asAnon = await anon.from("activities").delete().eq("id", activity.id).select("id");
    expect(asAnon.error?.code).toBe(refused);
    expect(await readActivity(activity.id)).not.toBeNull();
  });
});

describe("activities points", () => {
  it("activities points: equal the sum of question points after add, edit and delete", async () => {
    const created = await draft();
    const points = async () => (await readActivity(created.id))?.points;
    expect(await points()).toBe(0);
    const first = await addQuestion(world.teacher, created.id, { ...trueQuestion, points: 3 });
    expect(await points()).toBe(3);
    const second = await addQuestion(world.teacher, created.id, { kind: "ident", key: ["grant"], points: 5 });
    expect(await points()).toBe(8);
    const edited = await saveQuestion(world.teacher.client, created.id, { ...trueQuestion, points: 10 }, first);
    expect(edited.result?.status).toBe("saved");
    expect(await points()).toBe(15);
    expect((await world.teacher.client.rpc("delete_quiz_question", { target_question: second })).data).toBe("deleted");
    expect(await points()).toBe(10);
    expect((await world.teacher.client.rpc("delete_quiz_question", { target_question: first })).data).toBe("deleted");
    expect(await points()).toBe(0);
  });
});
