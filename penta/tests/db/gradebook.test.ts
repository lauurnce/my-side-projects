import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  addQuiz,
  addSubmission,
  addUpload,
  admin,
  anon,
  classGradebook,
  createActor,
  createClass,
  createRouteWorld,
  enroll,
  enrolledStudent,
  gradeSubmission,
  handIn,
  minutesAgo,
  myGrades,
  readActivity,
  readAttempt,
  refused,
  removeCreatedUsers,
  removeFromClass,
  saveAnswer,
  secondsFromNow,
  setAttempt,
  startedAttempt,
  submitAttempt,
  type Actor,
  type GradeCell,
  type QuestionSpec,
} from "./helpers";

type Activity = NonNullable<Awaited<ReturnType<typeof readActivity>>>;
type Quiz = Awaited<ReturnType<typeof addQuiz>>;

const daysAgo = (days: number) => minutesAgo(days * 24 * 60);
const twoQuestions: QuestionSpec[] = [
  { kind: "tf", key: true, prompt: "A role can own a table." },
  { kind: "tf", key: false, prompt: "Every role is a superuser." },
];

let world: Awaited<ReturnType<typeof createRouteWorld>>;
let studentC: Actor;
let quiz: Quiz;
let pastEssay: Activity;
let openEssay: Activity;
let draftEssay: Activity;

async function gradebook(classId = world.classroom.id) {
  const { cells, error } = await classGradebook(world.teacher.client, classId);
  expect(error).toBeNull();
  return cells!;
}

function cellOf(cells: GradeCell[], studentId: string, activityId: string) {
  const found = cells.filter((cell) => cell.student_id === studentId && cell.activity_id === activityId);
  expect(found).toHaveLength(1);
  return found[0];
}

async function joinedAt(classId: string, studentId: string, at: string) {
  const { error } = await admin.from("enrollments").update({ joined_at: at }).eq("class_id", classId).eq("student_id", studentId);
  if (error) throw error;
}

async function answered(student: Actor, target: Quiz, answers: boolean[]) {
  const attemptId = await startedAttempt(student.client, target.activity.id);
  const sent = Object.fromEntries(target.questionIds.map((questionId, index) => [questionId, answers[index]]));
  const { result } = await submitAttempt(student.client, attemptId, sent);
  expect(result?.status).toBe("submitted");
  return attemptId;
}

beforeAll(async () => {
  world = await createRouteWorld();
  studentC = await enrolledStudent(world.classroom.id, "student-c");
  for (const student of [world.studentA, world.studentB, studentC]) await joinedAt(world.classroom.id, student.id, daysAgo(3));

  quiz = await addQuiz(world.teacher, world.classroom.id, twoQuestions, { attemptLimit: 3 });
  pastEssay = await addUpload(world.classroom.id, world.teacher.id, { title: "Backup plan", points: 20, dueAt: daysAgo(1) });
  openEssay = await addUpload(world.classroom.id, world.teacher.id, { title: "Access review", points: 10, dueAt: secondsFromNow(2 * 86400) });
  draftEssay = await addUpload(world.classroom.id, world.teacher.id, { title: "Draft essay", published: false });

  await answered(world.studentA, quiz, [true, false]);
  await answered(world.studentA, quiz, [true, true]);
  await startedAttempt(world.studentB.client, quiz.activity.id);

  const onTime = await addSubmission(pastEssay, world.studentA.id, { submittedAt: daysAgo(2) });
  expect((await gradeSubmission(world.teacher.client, onTime.id, onTime.upload_id, 17)).result?.status).toBe("graded");
  await handIn(world.studentB, pastEssay.id);
  await handIn(world.studentB, openEssay.id);
});

afterAll(removeCreatedUsers);

describe("class_gradebook states", () => {
  it("class_gradebook: one cell per student and published activity", async () => {
    const cells = await gradebook();
    const mine = cells.filter((cell) => [world.studentA.id, world.studentB.id, studentC.id].includes(cell.student_id));
    const published = [quiz.activity.id, pastEssay.id, openEssay.id];
    expect(mine.filter((cell) => published.includes(cell.activity_id))).toHaveLength(9);
    expect(cells.filter((cell) => cell.activity_id === draftEssay.id)).toEqual([]);
    expect(Object.keys(cells[0]).sort()).toEqual(
      ["activity_id", "late", "points", "score", "state", "student_id", "submitted_at"].sort(),
    );
  });

  it("class_gradebook: graded shows the best quiz attempt and the given upload score", async () => {
    const cells = await gradebook();
    expect(cellOf(cells, world.studentA.id, quiz.activity.id)).toMatchObject({ state: "graded", score: 2, points: 2, late: false });
    const essayCell = cellOf(cells, world.studentA.id, pastEssay.id);
    expect(essayCell).toMatchObject({ state: "graded", score: 17, points: 20, late: false });
    expect(Date.parse(essayCell.submitted_at!)).toBeLessThan(Date.parse(pastEssay.due_at!));
  });

  it("class_gradebook: the best quiz attempt counts when a later attempt is lower", async () => {
    await answered(world.studentA, quiz, [false, true]);
    expect(cellOf(await gradebook(), world.studentA.id, quiz.activity.id)).toMatchObject({ state: "graded", score: 2 });
  });

  it("class_gradebook: submitted has no score, never the activity points, and carries the late flag", async () => {
    const cells = await gradebook();
    const late = cellOf(cells, world.studentB.id, pastEssay.id);
    expect(late).toEqual({
      student_id: world.studentB.id,
      activity_id: pastEssay.id,
      state: "submitted",
      score: null,
      points: 20,
      late: true,
      submitted_at: expect.any(String),
    });
    expect(cellOf(cells, world.studentB.id, openEssay.id)).toMatchObject({ state: "submitted", score: null, points: 10, late: false });
  });

  it("class_gradebook: in_progress while a quiz attempt is open", async () => {
    const cell = cellOf(await gradebook(), world.studentB.id, quiz.activity.id);
    expect(cell).toMatchObject({ state: "in_progress", score: null, points: 2, late: false, submitted_at: null });
  });

  it("class_gradebook: missing when the due time passed with nothing handed in", async () => {
    const cell = cellOf(await gradebook(), studentC.id, pastEssay.id);
    expect(cell).toEqual({
      student_id: studentC.id,
      activity_id: pastEssay.id,
      state: "missing",
      score: null,
      points: 20,
      late: false,
      submitted_at: null,
    });
  });

  it("class_gradebook: none when nothing is due yet or there is no due date", async () => {
    const cells = await gradebook();
    expect(cellOf(cells, studentC.id, openEssay.id)).toMatchObject({ state: "none", score: null, points: 10 });
    expect(cellOf(cells, studentC.id, quiz.activity.id)).toMatchObject({ state: "none", score: null, points: 2 });
    expect(cellOf(cells, world.studentA.id, openEssay.id)).toMatchObject({ state: "none", score: null });
  });

  it("class_gradebook: a student enrolled after the due time is none, not missing", async () => {
    const lateJoiner = await enrolledStudent(world.classroom.id, "late-joiner");
    expect(cellOf(await gradebook(), lateJoiner.id, pastEssay.id)).toMatchObject({ state: "none", score: null });
    await joinedAt(world.classroom.id, lateJoiner.id, daysAgo(2));
    expect(cellOf(await gradebook(), lateJoiner.id, pastEssay.id)).toMatchObject({ state: "missing", score: null });
    const mine = await myGrades(lateJoiner.client);
    expect(mine.cells!.find((cell) => cell.activity_id === pastEssay.id)).toMatchObject({ state: "missing" });
  });

  it("class_gradebook: a late upload that is graded keeps the late flag", async () => {
    const student = await enrolledStudent(world.classroom.id, "late-graded");
    const row = await handIn(student, pastEssay.id);
    expect(row.is_late).toBe(true);
    expect((await gradeSubmission(world.teacher.client, row.id, row.upload_id, 12)).result?.status).toBe("graded");
    expect(cellOf(await gradebook(), student.id, pastEssay.id)).toMatchObject({ state: "graded", score: 12, late: true });
  });

  it("class_gradebook: a removed student with a graded submission still appears", async () => {
    const leaver = await enrolledStudent(world.classroom.id, "leaver");
    await joinedAt(world.classroom.id, leaver.id, daysAgo(3));
    const row = await handIn(leaver, openEssay.id);
    expect((await gradeSubmission(world.teacher.client, row.id, row.upload_id, 8)).result?.status).toBe("graded");
    await removeFromClass(world.teacher, world.classroom.id, leaver.id);
    const cells = await gradebook();
    expect(cellOf(cells, leaver.id, openEssay.id)).toMatchObject({ state: "graded", score: 8, points: 10 });
    expect(cellOf(cells, leaver.id, pastEssay.id)).toMatchObject({ state: "none", score: null });
    expect((await myGrades(leaver.client)).cells).toEqual([]);
  });

  it("class_gradebook: a removed student with a quiz attempt still appears", async () => {
    const leaver = await enrolledStudent(world.classroom.id, "quiz-leaver");
    await answered(leaver, quiz, [true, false]);
    await removeFromClass(world.teacher, world.classroom.id, leaver.id);
    expect(cellOf(await gradebook(), leaver.id, quiz.activity.id)).toMatchObject({ state: "graded", score: 2 });
  });
});

describe("gradebook settles expired attempts", () => {
  async function expiredAttempt(student: Actor) {
    const timed = await addQuiz(world.teacher, world.classroom.id, twoQuestions, { timeLimitMin: 15 });
    const attemptId = await startedAttempt(student.client, timed.activity.id);
    expect((await saveAnswer(student.client, attemptId, timed.questionIds[0], true)).result?.status).toBe("saved");
    await setAttempt(attemptId, { expires_at: secondsFromNow(-60) });
    expect((await readAttempt(attemptId)).submitted_at).toBeNull();
    return { timed, attemptId };
  }

  it("class_gradebook: an expired quiz attempt nobody submitted is settled by the call", async () => {
    const { timed, attemptId } = await expiredAttempt(studentC);
    expect(cellOf(await gradebook(), studentC.id, timed.activity.id)).toMatchObject({ state: "graded", score: 1, points: 2 });
    expect(await readAttempt(attemptId)).toMatchObject({ score: 1, max_score: 2 });
    expect((await readAttempt(attemptId)).submitted_at).not.toBeNull();
  });

  it("my_grades: an expired quiz attempt of the caller is settled by the call", async () => {
    const { timed, attemptId } = await expiredAttempt(studentC);
    const { cells, error } = await myGrades(studentC.client);
    expect(error).toBeNull();
    expect(cells!.find((cell) => cell.activity_id === timed.activity.id)).toMatchObject({ state: "graded", score: 1, points: 2 });
    expect((await readAttempt(attemptId)).submitted_at).not.toBeNull();
  });

  it("my_grades: an attempt still inside its time is left open", async () => {
    const timed = await addQuiz(world.teacher, world.classroom.id, twoQuestions, { timeLimitMin: 15 });
    const attemptId = await startedAttempt(studentC.client, timed.activity.id);
    const { cells } = await myGrades(studentC.client);
    expect(cells!.find((cell) => cell.activity_id === timed.activity.id)).toMatchObject({ state: "in_progress", score: null });
    expect((await readAttempt(attemptId)).submitted_at).toBeNull();
  });
});

describe("gradebook access", () => {
  it("class_gradebook: nothing for a student, another teacher and the service role with no user", async () => {
    for (const client of [world.studentA.client, world.studentB.client, world.otherTeacher.client, world.otherStudent.client, admin]) {
      const { cells, error } = await classGradebook(client, world.classroom.id);
      expect(error).toBeNull();
      expect(cells).toEqual([]);
    }
    expect((await classGradebook(world.teacher.client, world.otherClassroom.id)).cells).toEqual([]);
    expect((await classGradebook(world.teacher.client, randomUUID())).cells).toEqual([]);
  });

  it("class_gradebook: anon cannot call it", async () => {
    const { cells, error } = await classGradebook(anon, world.classroom.id);
    expect(error?.code).toBe(refused);
    expect(cells).toBeNull();
  });

  it("my_grades: it returns only the caller's cells, never a classmate's", async () => {
    const all = await gradebook();
    for (const student of [world.studentA, world.studentB, studentC]) {
      const { cells, error } = await myGrades(student.client);
      expect(error).toBeNull();
      expect(Object.keys(cells![0]).sort()).toEqual(
        ["activity_id", "class_id", "late", "points", "score", "state", "submitted_at"].sort(),
      );
      expect(new Set(cells!.map((cell) => cell.class_id))).toEqual(new Set([world.classroom.id]));
      const expected = all
        .filter((cell) => cell.student_id === student.id)
        .map((cell) => ({
          class_id: world.classroom.id,
          activity_id: cell.activity_id,
          state: cell.state,
          score: cell.score,
          points: cell.points,
          late: cell.late,
          submitted_at: cell.submitted_at,
        }));
      const byActivity = (left: { activity_id: string }, right: { activity_id: string }) =>
        left.activity_id.localeCompare(right.activity_id);
      expect([...cells!].sort(byActivity)).toEqual(expected.sort(byActivity));
    }
    const mineA = (await myGrades(world.studentA.client)).cells!;
    expect(mineA.find((cell) => cell.activity_id === pastEssay.id)).toMatchObject({ state: "graded", score: 17 });
    const mineB = (await myGrades(world.studentB.client)).cells!;
    expect(mineB.find((cell) => cell.activity_id === pastEssay.id)).toMatchObject({ state: "submitted", score: null });
    expect(mineB.some((cell) => cell.score === 17)).toBe(false);
  });

  it("my_grades: a draft activity has no cell and a student in two classes gets both", async () => {
    const other = await addUpload(world.otherClassroom.id, world.otherTeacher.id, { points: 5 });
    await enroll(world.otherClassroom.id, world.studentA.id);
    const { cells } = await myGrades(world.studentA.client);
    expect(cells!.filter((cell) => cell.activity_id === draftEssay.id)).toEqual([]);
    expect(cells!.filter((cell) => cell.class_id === world.otherClassroom.id)).toEqual([
      { class_id: world.otherClassroom.id, activity_id: other.id, state: "none", score: null, points: 5, late: false, submitted_at: null },
    ]);
    expect(cells!.filter((cell) => cell.class_id === world.classroom.id).length).toBeGreaterThanOrEqual(3);
  });

  it("my_grades: a teacher and an outsider get nothing and anon cannot call it", async () => {
    for (const client of [world.teacher.client, world.outsider.client, admin]) {
      const { cells, error } = await myGrades(client);
      expect(error).toBeNull();
      expect(cells).toEqual([]);
    }
    const asAnon = await myGrades(anon);
    expect(asAnon.error?.code).toBe(refused);
    expect(asAnon.cells).toBeNull();
  });
});

describe("gradebook over 1,000 attempt rows", () => {
  const quizCount = 110;
  const attemptsPerQuiz = 10;
  const scoreOf = (quizIndex: number, attemptNo: number) => (quizIndex * 3 + attemptNo * 7) % 11;
  const bestOf = (quizIndex: number) =>
    Math.max(...Array.from({ length: attemptsPerQuiz }, (_, index) => scoreOf(quizIndex, index + 1)));

  let bulkTeacher: Actor;
  let bulkStudent: Actor;
  let bulkClassId: string;
  let quizIds: string[];

  beforeAll(async () => {
    [bulkTeacher, bulkStudent] = await Promise.all([createActor("bulk-teacher", "teacher"), createActor("bulk-student")]);
    bulkClassId = (await createClass(bulkTeacher.id, "Bulk attempts")).id;
    await enroll(bulkClassId, bulkStudent.id);
    quizIds = Array.from({ length: quizCount }, () => randomUUID());

    const quizzes = await admin.from("activities").insert(
      quizIds.map((id, index) => ({
        id,
        class_id: bulkClassId,
        title: `Weekly check ${index + 1}`,
        attempt_limit: attemptsPerQuiz,
        created_by: bulkTeacher.id,
      })),
    );
    if (quizzes.error) throw quizzes.error;
    const questionIds = quizIds.map(() => randomUUID());
    const questions = await admin.from("quiz_questions").insert(
      quizIds.map((activityId, index) => ({
        id: questionIds[index],
        activity_id: activityId,
        kind: "tf",
        prompt: "A role can own a table.",
        points: 10,
        position: 1,
      })),
    );
    if (questions.error) throw questions.error;
    const keys = await admin.from("quiz_answer_keys").insert(questionIds.map((questionId) => ({ question_id: questionId, answers: true })));
    if (keys.error) throw keys.error;
    const published = await admin.from("activities").update({ published_at: new Date().toISOString() }).eq("class_id", bulkClassId);
    if (published.error) throw published.error;

    const attempts = quizIds.flatMap((activityId, quizIndex) =>
      Array.from({ length: attemptsPerQuiz }, (_, index) => ({
        activity_id: activityId,
        student_id: bulkStudent.id,
        attempt_no: index + 1,
        started_at: minutesAgo(120 - index),
        submitted_at: minutesAgo(119 - index),
        score: scoreOf(quizIndex, index + 1),
        max_score: 10,
      })),
    );
    for (let start = 0; start < attempts.length; start += 550) {
      const { error } = await admin.from("quiz_attempts").insert(attempts.slice(start, start + 550));
      if (error) throw error;
    }
  });

  it("gradebook volume: the class holds 1,100 attempt rows and a plain read of them is cut short", async () => {
    const counted = await admin.from("quiz_attempts").select("id", { count: "exact", head: true }).eq("student_id", bulkStudent.id);
    expect(counted.count).toBe(quizCount * attemptsPerQuiz);
    const plain = await bulkTeacher.client.from("quiz_attempts").select("id").eq("student_id", bulkStudent.id);
    expect(plain.error).toBeNull();
    expect(plain.data!.length).toBeLessThan(quizCount * attemptsPerQuiz);
  });

  it("gradebook volume: every cell is graded with the best score", async () => {
    const { cells, error } = await classGradebook(bulkTeacher.client, bulkClassId);
    expect(error).toBeNull();
    expect(cells).toHaveLength(quizCount);
    quizIds.forEach((activityId, quizIndex) => {
      const cell = cells!.find((entry) => entry.activity_id === activityId);
      expect(cell).toMatchObject({ student_id: bulkStudent.id, state: "graded", score: bestOf(quizIndex), points: 10 });
    });
    expect(new Set(cells!.map((cell) => cell.score)).size).toBeGreaterThan(1);
  });

  it("gradebook volume: reading in pages with range returns all 110 cells for the student", async () => {
    const seen = new Map<string, number | null>();
    for (let start = 0; start < quizCount; start += 40) {
      const { data, error } = await bulkTeacher.client
        .rpc("class_gradebook", { target_class: bulkClassId })
        .order("activity_id")
        .range(start, start + 39);
      expect(error).toBeNull();
      for (const cell of data!) seen.set(cell.activity_id, cell.score);
    }
    expect(seen.size).toBe(quizCount);
    quizIds.forEach((activityId, quizIndex) => expect(seen.get(activityId)).toBe(bestOf(quizIndex)));
  });

  it("gradebook volume: my_grades gives the student the same 110 graded cells", async () => {
    const { cells, error } = await myGrades(bulkStudent.client);
    expect(error).toBeNull();
    expect(cells).toHaveLength(quizCount);
    expect(cells!.every((cell) => cell.state === "graded" && cell.class_id === bulkClassId)).toBe(true);
    quizIds.forEach((activityId, quizIndex) => {
      expect(cells!.find((cell) => cell.activity_id === activityId)?.score).toBe(bestOf(quizIndex));
    });
  });
});
