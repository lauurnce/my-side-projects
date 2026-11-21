import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  addLesson,
  addModule,
  anon,
  createClass,
  createRouteWorld,
  duplicateKey,
  enroll,
  markDone,
  readProgress,
  refused,
  removeCreatedUsers,
  setPublished,
  type Actor,
} from "./helpers";

let world: Awaited<ReturnType<typeof createRouteWorld>>;
let shared: Awaited<ReturnType<typeof addModule>>;
let draft: Awaited<ReturnType<typeof addLesson>>;
let foreignLesson: Awaited<ReturnType<typeof addLesson>>;

async function publishedLesson() {
  return addLesson(shared.id, `Lesson ${randomUUID().slice(0, 8)}`, true);
}

function mark(actor: Actor, lessonId: string, studentId = actor.id) {
  return actor.client.from("lesson_progress").insert({ lesson_id: lessonId, student_id: studentId });
}

function readAs(actor: Actor, lessonId: string) {
  return actor.client.from("lesson_progress").select("lesson_id, student_id").eq("lesson_id", lessonId);
}

beforeAll(async () => {
  world = await createRouteWorld();
  shared = await addModule(world.classroom.id, "Week 1");
  draft = await addLesson(shared.id, "Draft lesson");
  const foreignModule = await addModule(world.otherClassroom.id, "Their week 1");
  foreignLesson = await addLesson(foreignModule.id, "Their published lesson", true);
});

afterAll(removeCreatedUsers);

describe("lesson_progress insert", () => {
  it("lesson_progress insert: a student marks a published lesson done", async () => {
    const lesson = await publishedLesson();
    const { data, error } = await world.studentA.client
      .from("lesson_progress")
      .insert({ lesson_id: lesson.id, student_id: world.studentA.id })
      .select("lesson_id, student_id, completed_at");
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
    expect(data![0]).toMatchObject({ lesson_id: lesson.id, student_id: world.studentA.id });
    expect(Math.abs(Date.now() - new Date(data![0].completed_at).getTime())).toBeLessThan(60_000);
    expect(await readProgress(lesson.id)).toEqual(data);
  });

  it("lesson_progress insert: marking twice with ignoreDuplicates is not an error and leaves one row", async () => {
    const lesson = await publishedLesson();
    const row = { lesson_id: lesson.id, student_id: world.studentA.id };
    const options = { onConflict: "lesson_id,student_id", ignoreDuplicates: true };
    const first = await world.studentA.client.from("lesson_progress").upsert(row, options);
    expect(first.error).toBeNull();
    const afterFirst = await readProgress(lesson.id);
    expect(afterFirst).toHaveLength(1);
    const second = await world.studentA.client.from("lesson_progress").upsert(row, options);
    expect(second.error).toBeNull();
    expect(await readProgress(lesson.id)).toEqual(afterFirst);
  });

  it("lesson_progress insert: a plain second insert gives 23505", async () => {
    const lesson = await publishedLesson();
    expect((await mark(world.studentA, lesson.id)).error).toBeNull();
    const again = await mark(world.studentA, lesson.id);
    expect(again.error?.code).toBe(duplicateKey);
    expect(await readProgress(lesson.id)).toHaveLength(1);
  });

  it("lesson_progress insert: a student cannot mark a draft", async () => {
    const plain = await mark(world.studentA, draft.id);
    expect(plain.error?.code).toBe(refused);
    const ignoring = await world.studentA.client
      .from("lesson_progress")
      .upsert(
        { lesson_id: draft.id, student_id: world.studentA.id },
        { onConflict: "lesson_id,student_id", ignoreDuplicates: true },
      );
    expect(ignoring.error?.code).toBe(refused);
    expect(await readProgress(draft.id)).toEqual([]);
  });

  it("lesson_progress insert: a student cannot mark a lesson of another class", async () => {
    const { error } = await mark(world.studentA, foreignLesson.id);
    expect(error?.code).toBe(refused);
    expect(await readProgress(foreignLesson.id, world.studentA.id)).toEqual([]);
  });

  it("lesson_progress insert: a random lesson id is refused with 42501 and never 23503", async () => {
    const { error } = await mark(world.studentA, randomUUID());
    expect(error?.code).toBe(refused);
  });

  it("lesson_progress insert: a student cannot insert for another student", async () => {
    const lesson = await publishedLesson();
    const { error } = await mark(world.studentA, lesson.id, world.studentB.id);
    expect(error?.code).toBe(refused);
    expect(await readProgress(lesson.id)).toEqual([]);
  });

  it("lesson_progress insert: a student cannot set completed_at", async () => {
    const lesson = await publishedLesson();
    const { error } = await world.studentA.client
      .from("lesson_progress")
      .insert({ lesson_id: lesson.id, student_id: world.studentA.id, completed_at: "2020-01-01T00:00:00Z" });
    expect(error?.code).toBe(refused);
    expect(await readProgress(lesson.id)).toEqual([]);
  });

  it("lesson_progress insert: the teacher cannot mark their own lesson done, for themselves or for a student", async () => {
    const lesson = await publishedLesson();
    for (const lessonId of [lesson.id, draft.id]) {
      for (const studentId of [world.teacher.id, world.studentA.id]) {
        const { error } = await mark(world.teacher, lessonId, studentId);
        expect(error?.code).toBe(refused);
      }
    }
    expect(await readProgress(lesson.id)).toEqual([]);
    expect(await readProgress(draft.id)).toEqual([]);
  });

  it("lesson_progress insert: the outsider, a student of another class and another teacher cannot mark the lesson", async () => {
    const lesson = await publishedLesson();
    for (const actor of [world.outsider, world.otherStudent, world.otherTeacher]) {
      const { error } = await mark(actor, lesson.id);
      expect(error?.code).toBe(refused);
    }
    expect(await readProgress(lesson.id)).toEqual([]);
  });

  it("lesson_progress insert: anon cannot mark the lesson", async () => {
    const lesson = await publishedLesson();
    const { error } = await anon.from("lesson_progress").insert({ lesson_id: lesson.id, student_id: world.studentA.id });
    expect(error?.code).toBe(refused);
    expect(await readProgress(lesson.id)).toEqual([]);
  });
});

describe("lesson_progress select", () => {
  it("lesson_progress select: a student reads their own rows and never a classmate's", async () => {
    const lesson = await publishedLesson();
    await markDone(lesson.id, world.studentA.id);
    await markDone(lesson.id, world.studentB.id);
    const forLesson = await readAs(world.studentA, lesson.id);
    expect(forLesson.error).toBeNull();
    expect(forLesson.data).toEqual([{ lesson_id: lesson.id, student_id: world.studentA.id }]);
    const everything = await world.studentA.client.from("lesson_progress").select("student_id");
    expect(everything.error).toBeNull();
    expect(everything.data!.length).toBeGreaterThan(0);
    expect(everything.data!.every((row) => row.student_id === world.studentA.id)).toBe(true);
    const classmate = await world.studentA.client.from("lesson_progress").select("lesson_id").eq("student_id", world.studentB.id);
    expect(classmate.data).toEqual([]);
  });

  it("lesson_progress select: the teacher reads the progress of enrolled students", async () => {
    const lesson = await publishedLesson();
    await markDone(lesson.id, world.studentA.id);
    await markDone(lesson.id, world.studentB.id);
    const { data, error } = await readAs(world.teacher, lesson.id);
    expect(error).toBeNull();
    expect(data?.map((row) => row.student_id).sort()).toEqual([world.studentA.id, world.studentB.id].sort());
  });

  it("lesson_progress select: another teacher, a student of another class and the outsider read nothing", async () => {
    const lesson = await publishedLesson();
    await markDone(lesson.id, world.studentA.id);
    for (const actor of [world.otherTeacher, world.otherStudent, world.outsider]) {
      const { data, error } = await actor.client.from("lesson_progress").select("lesson_id");
      expect(error).toBeNull();
      expect(data).toEqual([]);
    }
  });

  it("lesson_progress select: anon is refused", async () => {
    const { data, error } = await anon.from("lesson_progress").select("lesson_id");
    expect(error?.code).toBe(refused);
    expect(data).toBeNull();
  });

  it("lesson_progress select: after the teacher unpublishes the lesson the student reads zero rows and the teacher still reads the row", async () => {
    const lesson = await publishedLesson();
    expect((await mark(world.studentA, lesson.id)).error).toBeNull();
    expect((await readAs(world.studentA, lesson.id)).data).toHaveLength(1);
    const unpublished = await world.teacher.client.from("lessons").update({ published_at: null }).eq("id", lesson.id).select("id");
    expect(unpublished.data).toHaveLength(1);
    const asStudent = await readAs(world.studentA, lesson.id);
    expect(asStudent.error).toBeNull();
    expect(asStudent.data).toEqual([]);
    const asTeacher = await readAs(world.teacher, lesson.id);
    expect(asTeacher.data).toEqual([{ lesson_id: lesson.id, student_id: world.studentA.id }]);
    expect(await readProgress(lesson.id)).toHaveLength(1);
  });

  it("lesson_progress select: after remove_student the teacher no longer reads that student's rows", async () => {
    const classroom = await createClass(world.teacher.id, "Roster changes");
    await enroll(classroom.id, world.studentA.id);
    await enroll(classroom.id, world.studentB.id);
    const lesson = await addLesson((await addModule(classroom.id)).id, "Kept by one", true);
    await markDone(lesson.id, world.studentA.id);
    await markDone(lesson.id, world.studentB.id);
    expect((await readAs(world.teacher, lesson.id)).data).toHaveLength(2);
    const removed = await world.teacher.client.rpc("remove_student", {
      target_class: classroom.id,
      target_student: world.studentB.id,
    });
    expect(removed.data).toBe(true);
    const asTeacher = await readAs(world.teacher, lesson.id);
    expect(asTeacher.error).toBeNull();
    expect(asTeacher.data).toEqual([{ lesson_id: lesson.id, student_id: world.studentA.id }]);
    const asRemoved = await readAs(world.studentB, lesson.id);
    expect(asRemoved.data).toEqual([]);
    expect(await readProgress(lesson.id)).toHaveLength(2);
  });
});

describe("lesson_progress update", () => {
  it("lesson_progress update: nobody can update a row", async () => {
    const lesson = await publishedLesson();
    await markDone(lesson.id, world.studentA.id);
    const before = await readProgress(lesson.id);
    const changes = [{ completed_at: "2020-01-01T00:00:00Z" }, { student_id: world.studentB.id }, { lesson_id: draft.id }];
    for (const client of [world.studentA.client, world.studentB.client, world.teacher.client, world.otherTeacher.client, anon]) {
      for (const change of changes) {
        const { error } = await client.from("lesson_progress").update(change).eq("lesson_id", lesson.id);
        expect(error?.code).toBe(refused);
      }
    }
    expect(await readProgress(lesson.id)).toEqual(before);
    expect(await readProgress(draft.id)).toEqual([]);
  });
});

describe("lesson_progress delete", () => {
  it("lesson_progress delete: a student deletes their own row and a second undo changes zero rows", async () => {
    const lesson = await publishedLesson();
    await markDone(lesson.id, world.studentA.id);
    await markDone(lesson.id, world.studentB.id);
    const undo = () =>
      world.studentA.client
        .from("lesson_progress")
        .delete()
        .eq("lesson_id", lesson.id)
        .eq("student_id", world.studentA.id)
        .select("lesson_id");
    const first = await undo();
    expect(first.error).toBeNull();
    expect(first.data).toEqual([{ lesson_id: lesson.id }]);
    const second = await undo();
    expect(second.error).toBeNull();
    expect(second.data).toEqual([]);
    expect((await readProgress(lesson.id)).map((row) => row.student_id)).toEqual([world.studentB.id]);
  });

  it("lesson_progress delete: a student cannot delete a classmate's row", async () => {
    const lesson = await publishedLesson();
    await markDone(lesson.id, world.studentB.id);
    const before = await readProgress(lesson.id);
    const aimed = await world.studentA.client
      .from("lesson_progress")
      .delete()
      .eq("lesson_id", lesson.id)
      .eq("student_id", world.studentB.id)
      .select("lesson_id");
    expect(aimed.error).toBeNull();
    expect(aimed.data).toEqual([]);
    const wide = await world.studentA.client.from("lesson_progress").delete().eq("lesson_id", lesson.id).select("lesson_id");
    expect(wide.data).toEqual([]);
    expect(await readProgress(lesson.id)).toEqual(before);
  });

  it("lesson_progress delete: the teacher, another teacher and the outsider cannot delete a student's row", async () => {
    const lesson = await publishedLesson();
    await markDone(lesson.id, world.studentA.id);
    const before = await readProgress(lesson.id);
    for (const actor of [world.teacher, world.otherTeacher, world.outsider]) {
      const { data, error } = await actor.client.from("lesson_progress").delete().eq("lesson_id", lesson.id).select("lesson_id");
      expect(error).toBeNull();
      expect(data).toEqual([]);
    }
    expect(await readProgress(lesson.id)).toEqual(before);
  });

  it("lesson_progress delete: anon cannot delete a row", async () => {
    const lesson = await publishedLesson();
    await markDone(lesson.id, world.studentA.id);
    const { error } = await anon.from("lesson_progress").delete().eq("lesson_id", lesson.id);
    expect(error?.code).toBe(refused);
    expect(await readProgress(lesson.id)).toHaveLength(1);
  });

  it("lesson_progress delete: a student cannot delete their row while the lesson is unpublished", async () => {
    const lesson = await publishedLesson();
    await markDone(lesson.id, world.studentA.id);
    await setPublished(lesson.id, false);
    const { data, error } = await world.studentA.client
      .from("lesson_progress")
      .delete()
      .eq("lesson_id", lesson.id)
      .eq("student_id", world.studentA.id)
      .select("lesson_id");
    expect(error).toBeNull();
    expect(data).toEqual([]);
    expect(await readProgress(lesson.id)).toHaveLength(1);
  });
});
