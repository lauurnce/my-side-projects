import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { altitudeWeights } from "../../src/lib/config";
import {
  addDeck,
  addLesson,
  addModule,
  addQuiz,
  addSubmission,
  addUnfinishedDeck,
  addUpload,
  admin,
  anon,
  createActor,
  createClass,
  enroll,
  finishDeck,
  handIn,
  markDone,
  minutesAgo,
  readAttempt,
  refused,
  removeCreatedUsers,
  removeFromClass,
  saveAnswer,
  secondsFromNow,
  setAttempt,
  startedAttempt,
  studentAltitude,
  type Actor,
  type ClassAltitude,
  type Client,
  type QuestionSpec,
} from "./helpers";

type Graded = [points: number, score: number];
type ClassSpec = { lessons?: [done: number, published: number]; decks?: [finished: number, total: number]; graded?: Graded[] };

const slideCount = 3;
const daysAgo = (days: number) => minutesAgo(days * 24 * 60);
const twoQuestions: QuestionSpec[] = [
  { kind: "tf", key: true, prompt: "A role can own a table." },
  { kind: "tf", key: false, prompt: "Every role is a superuser." },
];
const emptyClass: ClassSpec = {};
const halfDoneClass: ClassSpec = { lessons: [1, 2], decks: [1, 2], graded: [[20, 10]] };
const finishedClass: ClassSpec = { lessons: [2, 2], decks: [2, 2], graded: [[20, 20]] };

let teacher: Actor;
let secondTeacher: Actor;
let unrelatedTeacher: Actor;

function newStudent(name = "climber") {
  return createActor(name);
}

async function buildClass(student: Actor, spec: ClassSpec, owner: Actor = teacher, title = `Class ${randomUUID().slice(0, 8)}`) {
  const classroom = await createClass(owner.id, title);
  await enroll(classroom.id, student.id);
  const [lessonsDone, lessonsPublished] = spec.lessons ?? [0, 0];
  const [decksFinished, decksTotal] = spec.decks ?? [0, 0];
  if (lessonsPublished > 0) {
    const week = await addModule(classroom.id, "Week 1");
    for (let index = 0; index < lessonsPublished; index += 1) {
      const lesson = await addLesson(week.id, `Lesson ${index + 1}`, true);
      if (index < lessonsDone) await markDone(lesson.id, student.id);
    }
  }
  for (let index = 0; index < decksTotal; index += 1) {
    const deck = await addDeck(classroom.id, owner.id, { slideCount });
    if (index < decksFinished) await finishDeck(deck.id, student.id, slideCount);
  }
  for (const [points, score] of spec.graded ?? []) {
    const essay = await addUpload(classroom.id, owner.id, { points });
    await addSubmission(essay, student.id, { score, gradedBy: owner.id });
  }
  return classroom;
}

async function altitudeOf(client: Client, studentId: string) {
  const { altitude, error } = await studentAltitude(client, studentId);
  expect(error).toBeNull();
  return altitude;
}

async function ownAltitude(student: Actor) {
  const altitude = await altitudeOf(student.client, student.id);
  expect(altitude).not.toBeNull();
  return altitude!;
}

function classIn(classes: ClassAltitude[], classId: string) {
  const found = classes.filter((entry) => entry.class_id === classId);
  expect(found).toHaveLength(1);
  return found[0];
}

async function joinedAt(classId: string, studentId: string, at: string) {
  const { error } = await admin.from("enrollments").update({ joined_at: at }).eq("class_id", classId).eq("student_id", studentId);
  if (error) throw error;
}

beforeAll(async () => {
  [teacher, secondTeacher, unrelatedTeacher] = await Promise.all([
    createActor("teacher", "teacher"),
    createActor("second-teacher", "teacher"),
    createActor("unrelated-teacher", "teacher"),
  ]);
});

afterAll(removeCreatedUsers);

describe("altitude fixtures", () => {
  it("altitude weights: the config holds the weights the database uses", () => {
    expect(altitudeWeights).toEqual({ lessons: 1200, decks: 600, activities: 1200 });
  });

  it("an empty class: counts is false, 0 m, and it is left out of overall", async () => {
    const student = await newStudent();
    const empty = await buildClass(student, emptyClass);
    expect(await ownAltitude(student)).toEqual({
      overall: 0,
      classes: [
        {
          class_id: empty.id,
          counts: false,
          meters: 0,
          lessons_done: 0,
          lessons_published: 0,
          decks_finished: 0,
          decks: 0,
          points_earned: 0,
          points_possible: 0,
        },
      ],
    });

    const finished = await buildClass(student, finishedClass);
    const both = await ownAltitude(student);
    expect(both.classes).toHaveLength(2);
    expect(classIn(both.classes, empty.id)).toMatchObject({ counts: false, meters: 0 });
    expect(classIn(both.classes, finished.id)).toMatchObject({ counts: true, meters: 3000 });
    expect(both.overall).toBe(3000);
  });

  it("a half-done class: half the lessons, half the decks and half the points give 1,500 m", async () => {
    const student = await newStudent();
    const half = await buildClass(student, halfDoneClass);
    expect(await ownAltitude(student)).toEqual({
      overall: 1500,
      classes: [
        {
          class_id: half.id,
          counts: true,
          meters: 1500,
          lessons_done: 1,
          lessons_published: 2,
          decks_finished: 1,
          decks: 2,
          points_earned: 10,
          points_possible: 20,
        },
      ],
    });
  });

  it("a finished class: everything done gives exactly 3,000 m", async () => {
    const student = await newStudent();
    const finished = await buildClass(student, finishedClass);
    expect(await ownAltitude(student)).toEqual({
      overall: 3000,
      classes: [
        {
          class_id: finished.id,
          counts: true,
          meters: 3000,
          lessons_done: 2,
          lessons_published: 2,
          decks_finished: 2,
          decks: 2,
          points_earned: 20,
          points_possible: 20,
        },
      ],
    });
  });

  it("altitude: a class with nothing done counts and is 0 m", async () => {
    const student = await newStudent();
    const untouched = await buildClass(student, { lessons: [0, 2], decks: [0, 2], graded: [[20, 0]] });
    const altitude = await ownAltitude(student);
    expect(classIn(altitude.classes, untouched.id)).toMatchObject({ counts: true, meters: 0, points_earned: 0, points_possible: 20 });
    expect(altitude.overall).toBe(0);
  });
});

describe("altitude with parts skipped", () => {
  const cases: [string, ClassSpec, number][] = [
    ["lessons only, 1 of 2", { lessons: [1, 2] }, 1500],
    ["lessons only, 2 of 2", { lessons: [2, 2] }, 3000],
    ["decks only, 1 of 2", { decks: [1, 2] }, 1500],
    ["decks only, 2 of 2", { decks: [2, 2] }, 3000],
    ["points only, 10 of 20", { graded: [[20, 10]] }, 1500],
    ["points only, 5 of 20", { graded: [[20, 5]] }, 750],
    ["lessons and decks, all lessons and no decks", { lessons: [2, 2], decks: [0, 2] }, 2000],
    ["lessons and decks, no lessons and all decks", { lessons: [0, 2], decks: [2, 2] }, 1000],
    ["lessons and points, half the lessons and all points", { lessons: [1, 2], graded: [[20, 20]] }, 2250],
    ["decks and points, all decks and no points", { decks: [2, 2], graded: [[20, 0]] }, 1000],
    ["decks and points, no decks and all points", { decks: [0, 2], graded: [[20, 20]] }, 2000],
    ["all three, lessons done only", { lessons: [2, 2], decks: [0, 2], graded: [[20, 0]] }, 1200],
    ["all three, decks done only", { lessons: [0, 2], decks: [2, 2], graded: [[20, 0]] }, 600],
    ["all three, points earned only", { lessons: [0, 2], decks: [0, 2], graded: [[20, 20]] }, 1200],
  ];

  it.each(cases)("altitude parts: %s", async (_label, spec, meters) => {
    const student = await newStudent();
    const classroom = await buildClass(student, spec);
    const altitude = await ownAltitude(student);
    expect(classIn(altitude.classes, classroom.id)).toMatchObject({
      counts: true,
      meters,
      lessons_published: spec.lessons?.[1] ?? 0,
      decks: spec.decks?.[1] ?? 0,
      points_possible: (spec.graded ?? []).reduce((total, [points]) => total + points, 0),
    });
    expect(altitude.overall).toBe(Math.floor(meters / 10) * 10);
  });
});

describe("altitude rounding", () => {
  it("altitude rounding: 2,399 of 2,400 points is 2,998 m, never 3,000", async () => {
    const student = await newStudent();
    const almost = await buildClass(student, { graded: [[1000, 1000], [1000, 1000], [400, 399]] });
    const altitude = await ownAltitude(student);
    const entry = classIn(altitude.classes, almost.id);
    expect(entry).toMatchObject({ points_earned: 2399, points_possible: 2400, meters: 2998 });
    expect(entry.meters).toBeLessThan(3000);
    expect(altitude.overall).toBe(2990);
  });

  it("altitude rounding: overall is the average of counted classes rounded down to 10", async () => {
    const student = await newStudent();
    const top = await buildClass(student, finishedClass);
    const middle = await buildClass(student, { graded: [[600, 301]] });
    const empty = await buildClass(student, emptyClass);
    const altitude = await ownAltitude(student);
    expect(classIn(altitude.classes, top.id).meters).toBe(3000);
    expect(classIn(altitude.classes, middle.id).meters).toBe(1505);
    expect(classIn(altitude.classes, empty.id)).toMatchObject({ counts: false, meters: 0 });
    expect(altitude.overall).toBe(2250);
  });

  it("altitude rounding: 2 of 7 points is 857 m and the average with 1,000 m is 920", async () => {
    const student = await newStudent();
    const third = await buildClass(student, { lessons: [1, 3] });
    const uneven = await buildClass(student, { graded: [[7, 2]] });
    const altitude = await ownAltitude(student);
    expect(classIn(altitude.classes, third.id).meters).toBe(1000);
    expect(classIn(altitude.classes, uneven.id).meters).toBe(857);
    expect(altitude.overall).toBe(920);
  });
});

describe("altitude: what does not count", () => {
  it("altitude: a draft lesson, an unfinished deck, a deck of a draft lesson, an unpublished activity and ungraded work do not count", async () => {
    const student = await newStudent();
    const classroom = await buildClass(student, { lessons: [1, 1], decks: [1, 1], graded: [[10, 10]] });
    const before = classIn((await ownAltitude(student)).classes, classroom.id);
    expect(before).toMatchObject({ meters: 3000, lessons_published: 1, decks: 1, points_possible: 10 });

    const week = await addModule(classroom.id, "Week 2");
    const draftLesson = await addLesson(week.id, "Draft lesson", false);
    await addUnfinishedDeck(classroom.id, teacher.id);
    await addDeck(classroom.id, teacher.id, { slideCount, lessonId: draftLesson.id });
    const draftEssay = await addUpload(classroom.id, teacher.id, { points: 50, published: false });
    await addSubmission(draftEssay, student.id, { score: 0, gradedBy: teacher.id });
    const ungraded = await addUpload(classroom.id, teacher.id, { points: 40 });
    await handIn(student, ungraded.id);
    await addUpload(classroom.id, teacher.id, { points: 30, dueAt: secondsFromNow(86400) });
    await addQuiz(teacher, classroom.id, twoQuestions);

    expect(classIn((await ownAltitude(student)).classes, classroom.id)).toEqual(before);
  });

  it("altitude: a deck with all slides viewed in the same instant is not finished", async () => {
    const student = await newStudent();
    const classroom = await buildClass(student, { decks: [1, 1] });
    const rushed = await addDeck(classroom.id, teacher.id, { slideCount });
    const instant = minutesAgo(30);
    const views = Array.from({ length: slideCount }, (_, index) => ({
      deck_id: rushed.id,
      student_id: student.id,
      slide_no: index + 1,
      viewed_at: instant,
    }));
    expect((await admin.from("deck_views").insert(views)).error).toBeNull();
    const entry = classIn((await ownAltitude(student)).classes, classroom.id);
    expect(entry).toMatchObject({ decks: 2, decks_finished: 1, meters: 1500 });
  });

  it("altitude: a deck with one slide missing and another student's progress do not count", async () => {
    const student = await newStudent();
    const classmate = await newStudent("classmate");
    const classroom = await buildClass(student, { lessons: [0, 1], decks: [0, 1], graded: [] });
    await enroll(classroom.id, classmate.id);
    const partial = await addDeck(classroom.id, teacher.id, { slideCount });
    await finishDeck(partial.id, student.id, slideCount - 1);
    await finishDeck(partial.id, classmate.id, slideCount);
    const essay = await addUpload(classroom.id, teacher.id, { points: 10 });
    await addSubmission(essay, classmate.id, { score: 10, gradedBy: teacher.id });
    expect(classIn((await ownAltitude(student)).classes, classroom.id)).toMatchObject({
      counts: true,
      meters: 0,
      decks: 2,
      decks_finished: 0,
      points_earned: 0,
      points_possible: 0,
    });
    expect(classIn((await ownAltitude(classmate)).classes, classroom.id)).toMatchObject({ decks_finished: 1, points_earned: 10 });
  });

  it("altitude: past due with nothing counts as zero only when the due time is after the student joined", async () => {
    const student = await newStudent();
    const classroom = await buildClass(student, emptyClass);
    await addUpload(classroom.id, teacher.id, { points: 20, dueAt: daysAgo(1) });
    const joinedLate = classIn((await ownAltitude(student)).classes, classroom.id);
    expect(joinedLate).toMatchObject({ counts: false, meters: 0, points_earned: 0, points_possible: 0 });

    await joinedAt(classroom.id, student.id, daysAgo(2));
    const joinedEarly = await ownAltitude(student);
    expect(classIn(joinedEarly.classes, classroom.id)).toMatchObject({ counts: true, meters: 0, points_earned: 0, points_possible: 20 });

    const finished = await buildClass(student, finishedClass);
    const both = await ownAltitude(student);
    expect(classIn(both.classes, finished.id).meters).toBe(3000);
    expect(both.overall).toBe(1500);
  });

  it("altitude: an expired unsettled quiz attempt is settled by the call and counts with its real score", async () => {
    const student = await newStudent();
    const classroom = await buildClass(student, emptyClass);
    const timed = await addQuiz(teacher, classroom.id, twoQuestions, { timeLimitMin: 15 });
    const attemptId = await startedAttempt(student.client, timed.activity.id);
    expect((await saveAnswer(student.client, attemptId, timed.questionIds[0], true)).result?.status).toBe("saved");
    const open = classIn((await ownAltitude(student)).classes, classroom.id);
    expect(open).toMatchObject({ counts: false, points_possible: 0 });
    expect((await readAttempt(attemptId)).submitted_at).toBeNull();

    await setAttempt(attemptId, { expires_at: secondsFromNow(-60) });
    const settled = classIn((await ownAltitude(student)).classes, classroom.id);
    expect(settled).toMatchObject({ counts: true, points_earned: 1, points_possible: 2, meters: 1500 });
    expect(await readAttempt(attemptId)).toMatchObject({ score: 1, max_score: 2 });
    expect((await readAttempt(attemptId)).submitted_at).not.toBeNull();
  });
});

describe("altitude access", () => {
  let student: Actor;
  let classmate: Actor;
  let firstClass: Awaited<ReturnType<typeof createClass>>;
  let secondClass: Awaited<ReturnType<typeof createClass>>;

  beforeAll(async () => {
    [student, classmate] = await Promise.all([newStudent("two-classes"), newStudent("classmate")]);
    firstClass = await buildClass(student, finishedClass, teacher, "Database Administration");
    secondClass = await buildClass(student, halfDoneClass, secondTeacher, "Web Development");
    await enroll(firstClass.id, classmate.id);
  });

  it("altitude access: the student sees both classes and the average", async () => {
    const altitude = await ownAltitude(student);
    expect(altitude.classes.map((entry) => entry.class_id)).toEqual([firstClass.id, secondClass.id]);
    expect(altitude.classes.map((entry) => entry.meters)).toEqual([3000, 1500]);
    expect(altitude.overall).toBe(2250);
  });

  it("altitude access: a classmate's id gives null", async () => {
    expect(await altitudeOf(classmate.client, student.id)).toBeNull();
    expect(await altitudeOf(student.client, classmate.id)).toBeNull();
    expect((await ownAltitude(classmate)).classes.map((entry) => entry.class_id)).toEqual([firstClass.id]);
  });

  it("altitude access: an unknown id, a teacher's id and no id give null", async () => {
    for (const client of [student.client, teacher.client, admin]) {
      expect(await altitudeOf(client, randomUUID())).toBeNull();
      expect(await altitudeOf(client, teacher.id)).toBeNull();
      const { data, error } = await client.rpc("student_altitude", { target_student: null as never });
      expect(error).toBeNull();
      expect(data).toBeNull();
    }
  });

  it("altitude access: anon cannot call it", async () => {
    const { altitude, error } = await studentAltitude(anon, student.id);
    expect(error?.code).toBe(refused);
    expect(altitude).toBeNull();
  });

  it("altitude access: a teacher gets only the classes they teach and overall over those only", async () => {
    const first = await altitudeOf(teacher.client, student.id);
    expect(first!.classes.map((entry) => entry.class_id)).toEqual([firstClass.id]);
    expect(first!.overall).toBe(3000);
    expect(first!.classes[0].meters).toBe(3000);

    const second = await altitudeOf(secondTeacher.client, student.id);
    expect(second!.classes.map((entry) => entry.class_id)).toEqual([secondClass.id]);
    expect(second!.overall).toBe(1500);
    expect(second!.classes[0].meters).toBe(1500);
    expect(JSON.stringify(second)).not.toContain(firstClass.id);
    expect(JSON.stringify(first)).not.toContain(secondClass.id);
  });

  it("altitude access: a teacher of none of the student's classes gets null", async () => {
    expect(await altitudeOf(unrelatedTeacher.client, student.id)).toBeNull();
    expect(await altitudeOf(secondTeacher.client, classmate.id)).toBeNull();
  });

  it("altitude access: the service role gets every class", async () => {
    const all = await altitudeOf(admin, student.id);
    expect(all).toEqual(await ownAltitude(student));
    expect(all!.classes).toHaveLength(2);
    expect(all!.overall).toBe(2250);
  });

  it("altitude access: a class the student was removed from is gone for the student and the teacher", async () => {
    const leaver = await newStudent("leaver");
    const kept = await buildClass(leaver, halfDoneClass, teacher);
    const left = await buildClass(leaver, finishedClass, secondTeacher);
    expect((await ownAltitude(leaver)).overall).toBe(2250);
    await removeFromClass(secondTeacher, left.id, leaver.id);
    const after = await ownAltitude(leaver);
    expect(after.classes.map((entry) => entry.class_id)).toEqual([kept.id]);
    expect(after.overall).toBe(1500);
    expect(await altitudeOf(secondTeacher.client, leaver.id)).toBeNull();
  });
});
