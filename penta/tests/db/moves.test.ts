import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  addLesson,
  addModule,
  anon,
  createClass,
  createRouteWorld,
  lessonPositions,
  modulePositions,
  refused,
  removeCreatedUsers,
  type Client,
} from "./helpers";

type Move = "move_lesson" | "move_module";

let world: Awaited<ReturnType<typeof createRouteWorld>>;

function move(client: Client, name: Move, target: string, step: number | null) {
  return client.rpc(name, { target, step: step as number });
}

async function threeLessons() {
  const container = await addModule(world.classroom.id, `Module ${randomUUID().slice(0, 8)}`);
  const first = await addLesson(container.id, "First");
  const second = await addLesson(container.id, "Second", true);
  const third = await addLesson(container.id, "Third");
  return { container, first, second, third };
}

async function threeModules() {
  const classroom = await createClass(world.teacher.id, "Reordered class");
  const first = await addModule(classroom.id, "First");
  const second = await addModule(classroom.id, "Second");
  const third = await addModule(classroom.id, "Third");
  return { classroom, first, second, third };
}

async function lessonOrder(moduleId: string) {
  return (await lessonPositions(moduleId)).map((row) => row.id);
}

async function moduleOrder(classId: string) {
  return (await modulePositions(classId)).map((row) => row.id);
}

beforeAll(async () => {
  world = await createRouteWorld();
});

afterAll(removeCreatedUsers);

describe("move_lesson", () => {
  it("move_lesson: the teacher moves a lesson down and the order is swapped", async () => {
    const { container, first, second, third } = await threeLessons();
    const { data, error } = await move(world.teacher.client, "move_lesson", first.id, 1);
    expect(error).toBeNull();
    expect(data).toBe("moved");
    expect(await lessonPositions(container.id)).toEqual([
      { id: second.id, position: 1 },
      { id: first.id, position: 2 },
      { id: third.id, position: 3 },
    ]);
  });

  it("move_lesson: the teacher moves a lesson up and the order is swapped", async () => {
    const { container, first, second, third } = await threeLessons();
    const { data } = await move(world.teacher.client, "move_lesson", third.id, -1);
    expect(data).toBe("moved");
    expect(await lessonOrder(container.id)).toEqual([first.id, third.id, second.id]);
  });

  it("move_lesson: up on the first lesson and down on the last return edge and change nothing", async () => {
    const { container, first, third } = await threeLessons();
    const before = await lessonPositions(container.id);
    const up = await move(world.teacher.client, "move_lesson", first.id, -1);
    expect(up.error).toBeNull();
    expect(up.data).toBe("edge");
    const down = await move(world.teacher.client, "move_lesson", third.id, 1);
    expect(down.data).toBe("edge");
    expect(await lessonPositions(container.id)).toEqual(before);
  });

  it("move_lesson: step 0, 2, -2 and null return not_found and change nothing", async () => {
    const { container, second } = await threeLessons();
    const before = await lessonPositions(container.id);
    for (const step of [0, 2, -2, null]) {
      const { data, error } = await move(world.teacher.client, "move_lesson", second.id, step);
      expect(error).toBeNull();
      expect(data).toBe("not_found");
    }
    expect(await lessonPositions(container.id)).toEqual(before);
  });

  it("move_lesson: another teacher, an enrolled student, a student of another class and the outsider get not_found and the order stays", async () => {
    const { container, second } = await threeLessons();
    const before = await lessonPositions(container.id);
    for (const actor of [world.otherTeacher, world.studentA, world.otherStudent, world.outsider]) {
      for (const step of [-1, 1]) {
        const { data, error } = await move(actor.client, "move_lesson", second.id, step);
        expect(error).toBeNull();
        expect(data).toBe("not_found");
      }
    }
    expect(await lessonPositions(container.id)).toEqual(before);
  });

  it("move_lesson: anon is refused and the order stays", async () => {
    const { container, second } = await threeLessons();
    const before = await lessonPositions(container.id);
    const { data, error } = await move(anon, "move_lesson", second.id, 1);
    expect(error?.code).toBe(refused);
    expect(data).toBeNull();
    expect(await lessonPositions(container.id)).toEqual(before);
  });

  it("move_lesson: a random uuid gives not_found", async () => {
    const { data, error } = await move(world.teacher.client, "move_lesson", randomUUID(), 1);
    expect(error).toBeNull();
    expect(data).toBe("not_found");
  });

  it("move_lesson: a module id gives not_found", async () => {
    const { container } = await threeLessons();
    const { data } = await move(world.teacher.client, "move_lesson", container.id, 1);
    expect(data).toBe("not_found");
  });

  it("move_lesson: lessons of another module are never touched", async () => {
    const moved = await threeLessons();
    const untouched = await threeLessons();
    const before = await lessonPositions(untouched.container.id);
    for (const step of [1, 1, -1, 1]) {
      await move(world.teacher.client, "move_lesson", moved.first.id, step);
    }
    expect(await lessonOrder(moved.container.id)).toEqual([moved.second.id, moved.third.id, moved.first.id]);
    expect(await lessonPositions(untouched.container.id)).toEqual(before);
  });

  it("move_lesson: a move keeps published_at, revision and updated_at", async () => {
    const { first, second } = await threeLessons();
    await move(world.teacher.client, "move_lesson", first.id, 1);
    const { data } = await world.teacher.client
      .from("lessons")
      .select("id, published_at, revision, updated_at")
      .in("id", [first.id, second.id])
      .order("position");
    expect(data).toEqual([
      { id: second.id, published_at: second.published_at, revision: second.revision, updated_at: second.updated_at },
      { id: first.id, published_at: null, revision: first.revision, updated_at: first.updated_at },
    ]);
  });

  it("move_lesson: two parallel moves in one module leave a valid order with no duplicate positions", async () => {
    const { container, first, second, third } = await threeLessons();
    for (let round = 0; round < 5; round += 1) {
      const results = await Promise.all([
        move(world.teacher.client, "move_lesson", first.id, 1),
        move(world.teacher.client, "move_lesson", third.id, -1),
        move(world.teacher.client, "move_lesson", second.id, round % 2 === 0 ? 1 : -1),
      ]);
      for (const result of results) {
        expect(result.error).toBeNull();
        expect(["moved", "edge"]).toContain(result.data);
      }
      const after = await lessonPositions(container.id);
      expect(after.map((row) => row.position)).toEqual([1, 2, 3]);
      expect(after.map((row) => row.id).sort()).toEqual([first.id, second.id, third.id].sort());
    }
  });
});

describe("move_module", () => {
  it("move_module: the teacher moves a module down and the order is swapped", async () => {
    const { classroom, first, second, third } = await threeModules();
    const { data, error } = await move(world.teacher.client, "move_module", first.id, 1);
    expect(error).toBeNull();
    expect(data).toBe("moved");
    expect(await modulePositions(classroom.id)).toEqual([
      { id: second.id, position: 1 },
      { id: first.id, position: 2 },
      { id: third.id, position: 3 },
    ]);
  });

  it("move_module: the teacher moves a module up and the order is swapped", async () => {
    const { classroom, first, second, third } = await threeModules();
    const { data } = await move(world.teacher.client, "move_module", third.id, -1);
    expect(data).toBe("moved");
    expect(await moduleOrder(classroom.id)).toEqual([first.id, third.id, second.id]);
  });

  it("move_module: up on the first module and down on the last return edge and change nothing", async () => {
    const { classroom, first, third } = await threeModules();
    const before = await modulePositions(classroom.id);
    const up = await move(world.teacher.client, "move_module", first.id, -1);
    expect(up.error).toBeNull();
    expect(up.data).toBe("edge");
    const down = await move(world.teacher.client, "move_module", third.id, 1);
    expect(down.data).toBe("edge");
    expect(await modulePositions(classroom.id)).toEqual(before);
  });

  it("move_module: step 0, 2, -2 and null return not_found and change nothing", async () => {
    const { classroom, second } = await threeModules();
    const before = await modulePositions(classroom.id);
    for (const step of [0, 2, -2, null]) {
      const { data, error } = await move(world.teacher.client, "move_module", second.id, step);
      expect(error).toBeNull();
      expect(data).toBe("not_found");
    }
    expect(await modulePositions(classroom.id)).toEqual(before);
  });

  it("move_module: another teacher, an enrolled student, a student of another class and the outsider get not_found and the order stays", async () => {
    const first = await addModule(world.classroom.id, "Shared first");
    const second = await addModule(world.classroom.id, "Shared second");
    const before = await modulePositions(world.classroom.id);
    for (const actor of [world.otherTeacher, world.studentA, world.otherStudent, world.outsider]) {
      for (const target of [first.id, second.id]) {
        for (const step of [-1, 1]) {
          const { data, error } = await move(actor.client, "move_module", target, step);
          expect(error).toBeNull();
          expect(data).toBe("not_found");
        }
      }
    }
    expect(await modulePositions(world.classroom.id)).toEqual(before);
  });

  it("move_module: anon is refused and the order stays", async () => {
    const { classroom, second } = await threeModules();
    const before = await modulePositions(classroom.id);
    const { data, error } = await move(anon, "move_module", second.id, 1);
    expect(error?.code).toBe(refused);
    expect(data).toBeNull();
    expect(await modulePositions(classroom.id)).toEqual(before);
  });

  it("move_module: a random uuid gives not_found", async () => {
    const { data, error } = await move(world.teacher.client, "move_module", randomUUID(), 1);
    expect(error).toBeNull();
    expect(data).toBe("not_found");
  });

  it("move_module: modules of another class are never touched", async () => {
    const moved = await threeModules();
    const untouched = await threeModules();
    const before = await modulePositions(untouched.classroom.id);
    for (const step of [1, 1, -1, 1]) {
      await move(world.teacher.client, "move_module", moved.first.id, step);
    }
    expect(await moduleOrder(moved.classroom.id)).toEqual([moved.second.id, moved.third.id, moved.first.id]);
    expect(await modulePositions(untouched.classroom.id)).toEqual(before);
  });

  it("move_module: two parallel moves in one class leave a valid order with no duplicate positions", async () => {
    const { classroom, first, second, third } = await threeModules();
    for (let round = 0; round < 5; round += 1) {
      const results = await Promise.all([
        move(world.teacher.client, "move_module", first.id, 1),
        move(world.teacher.client, "move_module", third.id, -1),
        move(world.teacher.client, "move_module", second.id, round % 2 === 0 ? 1 : -1),
      ]);
      for (const result of results) {
        expect(result.error).toBeNull();
        expect(["moved", "edge"]).toContain(result.data);
      }
      const after = await modulePositions(classroom.id);
      expect(after.map((row) => row.position)).toEqual([1, 2, 3]);
      expect(after.map((row) => row.id).sort()).toEqual([first.id, second.id, third.id].sort());
    }
  });
});

describe("parallel inserts", () => {
  it("modules insert: ten parallel inserts in one class produce ten distinct positions", async () => {
    const classroom = await createClass(world.teacher.id, "Busy class");
    const results = await Promise.all(
      Array.from({ length: 10 }, (_, index) =>
        world.teacher.client.from("modules").insert({ class_id: classroom.id, title: `Week ${index + 1}` }).select("position"),
      ),
    );
    for (const result of results) expect(result.error).toBeNull();
    const after = await modulePositions(classroom.id);
    expect(after.map((row) => row.position)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  it("lessons insert: ten parallel inserts in one module produce ten distinct positions", async () => {
    const container = await addModule(world.classroom.id, "Busy module");
    const results = await Promise.all(
      Array.from({ length: 10 }, (_, index) =>
        world.teacher.client.from("lessons").insert({ module_id: container.id, title: `Lesson ${index + 1}` }).select("position"),
      ),
    );
    for (const result of results) expect(result.error).toBeNull();
    const after = await lessonPositions(container.id);
    expect(after.map((row) => row.position)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });
});
