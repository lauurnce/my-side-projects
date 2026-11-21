import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  addLesson,
  addModule,
  admin,
  anon,
  checkFailed,
  countModules,
  createClass,
  createRouteWorld,
  foreignKeyFailed,
  limitReached,
  readModule,
  refused,
  removeCreatedUsers,
} from "./helpers";

let world: Awaited<ReturnType<typeof createRouteWorld>>;
let shared: Awaited<ReturnType<typeof addModule>>;

async function countModulesTitled(title: string): Promise<number> {
  const { count, error } = await admin.from("modules").select("id", { count: "exact", head: true }).eq("title", title);
  if (error) throw error;
  return count ?? 0;
}

beforeAll(async () => {
  world = await createRouteWorld();
  shared = await addModule(world.classroom.id, "Week 1");
});

afterAll(removeCreatedUsers);

describe("modules insert", () => {
  it("modules insert: the teacher adds modules and the positions are 1 then 2", async () => {
    const target = await createClass(world.teacher.id);
    const first = await world.teacher.client
      .from("modules")
      .insert({ class_id: target.id, title: "Foundations" })
      .select("id, class_id, title, position")
      .single();
    const second = await world.teacher.client
      .from("modules")
      .insert({ class_id: target.id, title: "Backups" })
      .select("id, class_id, title, position")
      .single();
    expect(first.error).toBeNull();
    expect(second.error).toBeNull();
    expect(first.data).toMatchObject({ class_id: target.id, title: "Foundations", position: 1 });
    expect(second.data).toMatchObject({ class_id: target.id, title: "Backups", position: 2 });
    expect((await readModule(second.data!.id)).position).toBe(2);
  });

  it("modules insert: the teacher cannot choose the position, the id or the creation time", async () => {
    const title = `Chosen ${randomUUID()}`;
    const chosen = [{ position: 7 }, { id: randomUUID() }, { created_at: "2020-01-01T00:00:00Z" }];
    for (const extra of chosen) {
      const { error } = await world.teacher.client
        .from("modules")
        .insert({ class_id: world.classroom.id, title, ...extra });
      expect(error?.code).toBe(refused);
    }
    expect(await countModulesTitled(title)).toBe(0);
  });

  it("modules insert: another teacher cannot add a module to the class", async () => {
    const title = `Borrowed ${randomUUID()}`;
    const { error } = await world.otherTeacher.client.from("modules").insert({ class_id: world.classroom.id, title });
    expect(error?.code).toBe(refused);
    expect(await countModulesTitled(title)).toBe(0);
  });

  it("modules insert: an enrolled student and the outsider cannot add a module", async () => {
    const title = `Student module ${randomUUID()}`;
    for (const actor of [world.studentA, world.outsider]) {
      const { error } = await actor.client.from("modules").insert({ class_id: world.classroom.id, title });
      expect(error?.code).toBe(refused);
    }
    expect(await countModulesTitled(title)).toBe(0);
  });

  it("modules insert: anon cannot add a module", async () => {
    const title = `Anon module ${randomUUID()}`;
    const { error } = await anon.from("modules").insert({ class_id: world.classroom.id, title });
    expect(error?.code).toBe(refused);
    expect(await countModulesTitled(title)).toBe(0);
  });

  it("modules insert: a title with a control character, 121 characters or nothing is refused", async () => {
    const before = await countModules(world.classroom.id);
    for (const title of ["Bell\u0007", "a".repeat(121), ""]) {
      const { error } = await world.teacher.client.from("modules").insert({ class_id: world.classroom.id, title });
      expect(error?.code).toBe(checkFailed);
    }
    expect(await countModules(world.classroom.id)).toBe(before);
  });

  it("modules insert: a title of 120 characters is accepted", async () => {
    const title = "a".repeat(120);
    const { data, error } = await world.teacher.client
      .from("modules")
      .insert({ class_id: world.classroom.id, title })
      .select("title")
      .single();
    expect(error).toBeNull();
    expect(data?.title).toBe(title);
  });

  it("modules insert: the 31st module in a class is refused with module_limit", async () => {
    const target = await createClass(world.teacher.id, "Full class");
    for (let index = 1; index <= 30; index += 1) {
      const { error } = await world.teacher.client.from("modules").insert({ class_id: target.id, title: `Week ${index}` });
      expect(error).toBeNull();
    }
    expect(await countModules(target.id)).toBe(30);
    const { error } = await world.teacher.client.from("modules").insert({ class_id: target.id, title: "Week 31" });
    expect(error?.code).toBe(limitReached);
    expect(error?.message).toBe("module_limit");
    expect(await countModules(target.id)).toBe(30);
  });
});

describe("modules select", () => {
  it("modules select: the teacher reads the modules of the class", async () => {
    const { data, error } = await world.teacher.client
      .from("modules")
      .select("id, class_id, title, position, created_at")
      .eq("id", shared.id);
    expect(error).toBeNull();
    expect(data).toEqual([shared]);
  });

  it("modules select: an enrolled student reads the modules of the class", async () => {
    const { data, error } = await world.studentA.client.from("modules").select("id, title").eq("id", shared.id);
    expect(error).toBeNull();
    expect(data).toEqual([{ id: shared.id, title: shared.title }]);
  });

  it("modules select: the outsider, another teacher and a student of another class read nothing", async () => {
    for (const actor of [world.outsider, world.otherTeacher, world.otherStudent]) {
      const { data, error } = await actor.client.from("modules").select("id").eq("class_id", world.classroom.id);
      expect(error).toBeNull();
      expect(data).toEqual([]);
    }
  });

  it("modules select: anon is refused", async () => {
    const { data, error } = await anon.from("modules").select("id");
    expect(error?.code).toBe(refused);
    expect(data).toBeNull();
  });
});

describe("modules update", () => {
  it("modules update: the teacher renames a module", async () => {
    const target = await addModule(world.classroom.id, "Old name");
    const { data, error } = await world.teacher.client
      .from("modules")
      .update({ title: "New name" })
      .eq("id", target.id)
      .select("id, title, position");
    expect(error).toBeNull();
    expect(data).toEqual([{ id: target.id, title: "New name", position: target.position }]);
    expect(await readModule(target.id)).toEqual({ ...target, title: "New name" });
  });

  it("modules update: the teacher cannot update class_id, position, id or created_at", async () => {
    const changes = [
      { class_id: world.otherClassroom.id },
      { position: 99 },
      { id: randomUUID() },
      { created_at: "2020-01-01T00:00:00Z" },
    ];
    for (const change of changes) {
      const { error } = await world.teacher.client.from("modules").update(change).eq("id", shared.id);
      expect(error?.code).toBe(refused);
    }
    expect(await readModule(shared.id)).toEqual(shared);
  });

  it("modules update: an enrolled student, another teacher and the outsider cannot rename a module", async () => {
    for (const actor of [world.studentA, world.otherTeacher, world.outsider]) {
      const { data, error } = await actor.client
        .from("modules")
        .update({ title: "Renamed by someone else" })
        .eq("id", shared.id)
        .select("id");
      expect(error).toBeNull();
      expect(data).toEqual([]);
    }
    expect(await readModule(shared.id)).toEqual(shared);
  });

  it("modules update: anon cannot rename a module", async () => {
    const { error } = await anon.from("modules").update({ title: "Renamed by nobody" }).eq("id", shared.id);
    expect(error?.code).toBe(refused);
    expect(await readModule(shared.id)).toEqual(shared);
  });

  it("modules update: a title with a control character or 121 characters is refused", async () => {
    for (const title of ["Bell\u0007", "a".repeat(121)]) {
      const { error } = await world.teacher.client.from("modules").update({ title }).eq("id", shared.id);
      expect(error?.code).toBe(checkFailed);
    }
    expect(await readModule(shared.id)).toEqual(shared);
  });
});

describe("modules delete", () => {
  it("modules delete: the teacher deletes an empty module", async () => {
    const target = await addModule(world.classroom.id, "Empty");
    const { data, error } = await world.teacher.client.from("modules").delete().eq("id", target.id).select("id");
    expect(error).toBeNull();
    expect(data).toEqual([{ id: target.id }]);
    expect(await countModulesTitled("Empty")).toBe(0);
  });

  it("modules delete: a module that still has a lesson is refused with 23503", async () => {
    const target = await addModule(world.classroom.id, "Holds a lesson");
    await addLesson(target.id);
    const { error } = await world.teacher.client.from("modules").delete().eq("id", target.id).select("id");
    expect(error?.code).toBe(foreignKeyFailed);
    expect(await readModule(target.id)).toEqual(target);
  });

  it("modules delete: an enrolled student, another teacher and the outsider cannot delete a module", async () => {
    for (const actor of [world.studentA, world.otherTeacher, world.outsider]) {
      const { data, error } = await actor.client.from("modules").delete().eq("id", shared.id).select("id");
      expect(error).toBeNull();
      expect(data).toEqual([]);
    }
    expect(await readModule(shared.id)).toEqual(shared);
  });

  it("modules delete: anon cannot delete a module", async () => {
    const { error } = await anon.from("modules").delete().eq("id", shared.id);
    expect(error?.code).toBe(refused);
    expect(await readModule(shared.id)).toEqual(shared);
  });
});
