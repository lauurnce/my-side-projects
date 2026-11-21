import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  admin,
  anon,
  countEnrollments,
  createClass,
  createWorld,
  enroll,
  join,
  joinCodePattern,
  readClass,
  refused,
  removeCreatedUsers,
} from "./helpers";

let world: Awaited<ReturnType<typeof createWorld>>;

async function readJoinedAt(studentId: string) {
  const { data, error } = await admin
    .from("enrollments")
    .select("joined_at")
    .eq("class_id", world.classroom.id)
    .eq("student_id", studentId)
    .single();
  if (error) throw error;
  return data.joined_at;
}

async function classWithStudentB() {
  const target = await createClass(world.teacher.id);
  await enroll(target.id, world.studentB.id);
  return target;
}

beforeAll(async () => {
  world = await createWorld();
});

afterAll(removeCreatedUsers);

describe("enrollments insert", () => {
  it("enrollments insert: a student cannot insert their own enrollment", async () => {
    const { error } = await world.outsider.client
      .from("enrollments")
      .insert({ class_id: world.classroom.id, student_id: world.outsider.id });
    expect(error?.code).toBe(refused);
    expect(await countEnrollments(world.classroom.id, world.outsider.id)).toBe(0);
  });

  it("enrollments insert: a teacher cannot insert an enrollment", async () => {
    const { error } = await world.teacher.client
      .from("enrollments")
      .insert({ class_id: world.classroom.id, student_id: world.outsider.id });
    expect(error?.code).toBe(refused);
    expect(await countEnrollments(world.classroom.id, world.outsider.id)).toBe(0);
  });

  it("enrollments insert: anon cannot insert an enrollment", async () => {
    const { error } = await anon.from("enrollments").insert({ class_id: world.classroom.id, student_id: world.outsider.id });
    expect(error?.code).toBe(refused);
    expect(await countEnrollments(world.classroom.id, world.outsider.id)).toBe(0);
  });

  it("enrollments insert: join_class with the right code is the allowed way in", async () => {
    const target = await createClass(world.teacher.id);
    const { result } = await join(world.outsider.client, target.join_code);
    expect(result).toEqual({ status: "joined", class_id: target.id });
    expect(await countEnrollments(target.id, world.outsider.id)).toBe(1);
  });
});

describe("enrollments select", () => {
  it("enrollments select: the student reads their own row", async () => {
    const { data, error } = await world.studentA.client
      .from("enrollments")
      .select("class_id, student_id")
      .eq("class_id", world.classroom.id);
    expect(error).toBeNull();
    expect(data).toEqual([{ class_id: world.classroom.id, student_id: world.studentA.id }]);
  });

  it("enrollments select: the teacher reads the roster", async () => {
    const { data, error } = await world.teacher.client
      .from("enrollments")
      .select("student_id")
      .eq("class_id", world.classroom.id);
    expect(error).toBeNull();
    expect(data?.map((row) => row.student_id).sort()).toEqual([world.studentA.id, world.studentB.id].sort());
  });

  it("enrollments select: a classmate cannot read another student's row", async () => {
    const { data, error } = await world.studentA.client
      .from("enrollments")
      .select("student_id")
      .eq("student_id", world.studentB.id);
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it("enrollments select: another teacher reads nothing", async () => {
    const { data, error } = await world.otherTeacher.client
      .from("enrollments")
      .select("student_id")
      .eq("class_id", world.classroom.id);
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it("enrollments select: the outsider reads nothing", async () => {
    const { data, error } = await world.outsider.client
      .from("enrollments")
      .select("student_id")
      .eq("class_id", world.classroom.id);
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it("enrollments select: anon reads nothing", async () => {
    const { data, error } = await anon.from("enrollments").select("student_id");
    expect(error?.code).toBe(refused);
    expect(data).toBeNull();
  });
});

describe("enrollments update", () => {
  it("enrollments update: nobody can update an enrollment", async () => {
    const before = await readJoinedAt(world.studentA.id);
    for (const client of [world.studentA.client, world.teacher.client, world.otherTeacher.client, anon]) {
      const { error } = await client
        .from("enrollments")
        .update({ joined_at: "2020-01-01T00:00:00Z" })
        .eq("class_id", world.classroom.id)
        .eq("student_id", world.studentA.id);
      expect(error?.code).toBe(refused);
    }
    expect(await readJoinedAt(world.studentA.id)).toBe(before);
  });

  it("enrollments update: a student cannot move their enrollment to another class", async () => {
    const other = await createClass(world.otherTeacher.id);
    const { error } = await world.studentA.client
      .from("enrollments")
      .update({ class_id: other.id })
      .eq("student_id", world.studentA.id);
    expect(error?.code).toBe(refused);
    expect(await countEnrollments(other.id, world.studentA.id)).toBe(0);
    expect(await countEnrollments(world.classroom.id, world.studentA.id)).toBe(1);
  });
});

describe("enrollments delete", () => {
  it("enrollments delete: nobody can delete an enrollment directly", async () => {
    for (const client of [world.studentA.client, world.teacher.client, world.otherTeacher.client, anon]) {
      const { error } = await client
        .from("enrollments")
        .delete()
        .eq("class_id", world.classroom.id)
        .eq("student_id", world.studentA.id);
      expect(error?.code).toBe(refused);
    }
    expect(await countEnrollments(world.classroom.id, world.studentA.id)).toBe(1);
  });

  it("enrollments delete: remove_student by the owner returns true, removes the row and changes the join code", async () => {
    const target = await classWithStudentB();
    const { data, error } = await world.teacher.client.rpc("remove_student", {
      target_class: target.id,
      target_student: world.studentB.id,
    });
    expect(error).toBeNull();
    expect(data).toBe(true);
    expect(await countEnrollments(target.id, world.studentB.id)).toBe(0);

    const rotated = (await readClass(target.id)).join_code;
    expect(rotated).toMatch(joinCodePattern);
    expect(rotated).not.toBe(target.join_code);

    const withOldCode = await join(world.studentB.client, target.join_code);
    expect(withOldCode.result).toEqual({ status: "invalid" });
    expect(await countEnrollments(target.id, world.studentB.id)).toBe(0);
  });

  it("enrollments delete: remove_student by another teacher or a student returns false and the row stays", async () => {
    const target = await classWithStudentB();
    for (const actor of [world.otherTeacher, world.studentA, world.studentB, world.outsider]) {
      const { data, error } = await actor.client.rpc("remove_student", {
        target_class: target.id,
        target_student: world.studentB.id,
      });
      expect(error).toBeNull();
      expect(data).toBe(false);
    }
    expect(await countEnrollments(target.id, world.studentB.id)).toBe(1);
    expect((await readClass(target.id)).join_code).toBe(target.join_code);
  });

  it("enrollments delete: remove_student by anon is refused and the row stays", async () => {
    const target = await classWithStudentB();
    const { error } = await anon.rpc("remove_student", { target_class: target.id, target_student: world.studentB.id });
    expect(error?.code).toBe(refused);
    expect(await countEnrollments(target.id, world.studentB.id)).toBe(1);
  });

  it("enrollments delete: remove_student for a student who is not enrolled returns false and keeps the join code", async () => {
    const target = await createClass(world.teacher.id);
    const { data, error } = await world.teacher.client.rpc("remove_student", {
      target_class: target.id,
      target_student: world.outsider.id,
    });
    expect(error).toBeNull();
    expect(data).toBe(false);
    expect((await readClass(target.id)).join_code).toBe(target.join_code);
  });
});
