import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  admin,
  anon,
  checkFailed,
  createClass,
  createWorld,
  joinCodePattern,
  readClass,
  refused,
  removeCreatedUsers,
} from "./helpers";

let world: Awaited<ReturnType<typeof createWorld>>;

async function countClassesTitled(title: string): Promise<number> {
  const { count, error } = await admin.from("classes").select("id", { count: "exact", head: true }).eq("title", title);
  if (error) throw error;
  return count ?? 0;
}

beforeAll(async () => {
  world = await createWorld();
});

afterAll(removeCreatedUsers);

describe("classes insert", () => {
  it("classes insert: a teacher creates a class", async () => {
    const { data, error } = await world.teacher.client
      .from("classes")
      .insert({ code: "COMP 018", title: "Database Administration", section: "Lab", term: "1st sem", teacher_id: world.teacher.id })
      .select("id, code, title, section, term, teacher_id")
      .single();
    expect(error).toBeNull();
    expect(data).toMatchObject({ code: "COMP 018", title: "Database Administration", teacher_id: world.teacher.id });
    expect((await readClass(data!.id)).join_code).toMatch(joinCodePattern);
  });

  it("classes insert: a student cannot create a class", async () => {
    const title = `Student class ${randomUUID()}`;
    const own = await world.studentA.client.from("classes").insert({ code: "COMP 018", title, teacher_id: world.studentA.id });
    expect(own.error?.code).toBe(refused);
    const forTeacher = await world.studentA.client
      .from("classes")
      .insert({ code: "COMP 018", title, teacher_id: world.teacher.id });
    expect(forTeacher.error?.code).toBe(refused);
    expect(await countClassesTitled(title)).toBe(0);
  });

  it("classes insert: a teacher cannot create a class owned by another teacher", async () => {
    const title = `Borrowed class ${randomUUID()}`;
    const { error } = await world.teacher.client
      .from("classes")
      .insert({ code: "COMP 018", title, teacher_id: world.otherTeacher.id });
    expect(error?.code).toBe(refused);
    expect(await countClassesTitled(title)).toBe(0);
  });

  it("classes insert: a teacher cannot choose the id, the join code or the creation time", async () => {
    const title = `Chosen code ${randomUUID()}`;
    const chosen = [{ join_code: "AAAAAAAAAA" }, { id: randomUUID() }, { created_at: "2020-01-01T00:00:00Z" }];
    for (const extra of chosen) {
      const { error } = await world.teacher.client
        .from("classes")
        .insert({ code: "COMP 018", title, teacher_id: world.teacher.id, ...extra });
      expect(error?.code).toBe(refused);
    }
    expect(await countClassesTitled(title)).toBe(0);
  });

  it("classes insert: anon cannot create a class", async () => {
    const title = `Anon class ${randomUUID()}`;
    const { error } = await anon.from("classes").insert({ code: "COMP 018", title, teacher_id: world.teacher.id });
    expect(error?.code).toBe(refused);
    expect(await countClassesTitled(title)).toBe(0);
  });

  it("classes insert: a title with a control character is refused", async () => {
    const title = `Bell\u0007 ${randomUUID()}`;
    const { error } = await world.teacher.client.from("classes").insert({ code: "COMP 018", title, teacher_id: world.teacher.id });
    expect(error?.code).toBe(checkFailed);
    expect(await countClassesTitled(title)).toBe(0);
  });
});

describe("classes select", () => {
  it("classes select: the owner reads the class", async () => {
    const { data, error } = await world.teacher.client
      .from("classes")
      .select("id, code, title, section, term, teacher_id, created_at")
      .eq("id", world.classroom.id);
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
    expect(data![0]).toMatchObject({ id: world.classroom.id, teacher_id: world.teacher.id });
  });

  it("classes select: another teacher reads nothing", async () => {
    const { data, error } = await world.otherTeacher.client.from("classes").select("id");
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it("classes select: an enrolled student reads the class", async () => {
    const { data, error } = await world.studentA.client.from("classes").select("id, title");
    expect(error).toBeNull();
    expect(data).toEqual([{ id: world.classroom.id, title: world.classroom.title }]);
  });

  it("classes select: an outsider reads nothing", async () => {
    const { data, error } = await world.outsider.client.from("classes").select("id");
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it("classes select: anon reads nothing", async () => {
    const { data, error } = await anon.from("classes").select("id");
    expect(error?.code).toBe(refused);
    expect(data).toBeNull();
  });

  it("classes select: nobody can select join_code", async () => {
    for (const client of [world.teacher.client, world.studentA.client, world.outsider.client, anon]) {
      const named = await client.from("classes").select("join_code").eq("id", world.classroom.id);
      expect(named.error?.code).toBe(refused);
      expect(named.data).toBeNull();
      const everything = await client.from("classes").select("*").eq("id", world.classroom.id);
      expect(everything.error?.code).toBe(refused);
      expect(everything.data).toBeNull();
    }
  });

  it("classes select: nobody can probe join_code through a filter", async () => {
    for (const client of [world.teacher.client, world.studentA.client, world.outsider.client]) {
      const { data, error } = await client.from("classes").select("id").eq("join_code", world.classroom.join_code);
      expect(error?.code).toBe(refused);
      expect(data).toBeNull();
    }
  });
});

describe("classes update", () => {
  it("classes update: the owner updates the title", async () => {
    const target = await createClass(world.teacher.id);
    const { data, error } = await world.teacher.client
      .from("classes")
      .update({ title: "Systems Integration and Architecture 2", code: "INTE 302", section: "BSIT 3-2", term: "2nd sem" })
      .eq("id", target.id)
      .select("title, code, section, term");
    expect(error).toBeNull();
    expect(data).toEqual([
      { title: "Systems Integration and Architecture 2", code: "INTE 302", section: "BSIT 3-2", term: "2nd sem" },
    ]);
    const after = await readClass(target.id);
    expect(after.title).toBe("Systems Integration and Architecture 2");
    expect(after.join_code).toBe(target.join_code);
  });

  it("classes update: the owner cannot update teacher_id", async () => {
    const { error } = await world.teacher.client
      .from("classes")
      .update({ teacher_id: world.otherTeacher.id })
      .eq("id", world.classroom.id);
    expect(error?.code).toBe(refused);
    expect((await readClass(world.classroom.id)).teacher_id).toBe(world.teacher.id);
  });

  it("classes update: the owner cannot update join_code", async () => {
    const { error } = await world.teacher.client
      .from("classes")
      .update({ join_code: "AAAAAAAAAA" })
      .eq("id", world.classroom.id);
    expect(error?.code).toBe(refused);
    expect((await readClass(world.classroom.id)).join_code).toBe(world.classroom.join_code);
  });

  it("classes update: another teacher cannot update the class", async () => {
    const { data, error } = await world.otherTeacher.client
      .from("classes")
      .update({ title: "Taken over" })
      .eq("id", world.classroom.id)
      .select("id");
    expect(error).toBeNull();
    expect(data).toEqual([]);
    expect((await readClass(world.classroom.id)).title).toBe(world.classroom.title);
  });

  it("classes update: an enrolled student cannot update the class", async () => {
    const { data, error } = await world.studentA.client
      .from("classes")
      .update({ title: "Renamed by a student" })
      .eq("id", world.classroom.id)
      .select("id");
    expect(error).toBeNull();
    expect(data).toEqual([]);
    expect((await readClass(world.classroom.id)).title).toBe(world.classroom.title);
  });

  it("classes update: anon cannot update the class", async () => {
    const { error } = await anon.from("classes").update({ title: "Renamed by nobody" }).eq("id", world.classroom.id);
    expect(error?.code).toBe(refused);
    expect((await readClass(world.classroom.id)).title).toBe(world.classroom.title);
  });

  it("classes update: a title with a control character is refused", async () => {
    const { error } = await world.teacher.client
      .from("classes")
      .update({ title: "Bell\u0007" })
      .eq("id", world.classroom.id);
    expect(error?.code).toBe(checkFailed);
    expect((await readClass(world.classroom.id)).title).toBe(world.classroom.title);
  });
});

describe("classes delete", () => {
  it("classes delete: the owner cannot delete the class", async () => {
    const { error } = await world.teacher.client.from("classes").delete().eq("id", world.classroom.id);
    expect(error?.code).toBe(refused);
    expect((await readClass(world.classroom.id)).id).toBe(world.classroom.id);
  });

  it("classes delete: an enrolled student cannot delete the class", async () => {
    const { error } = await world.studentA.client.from("classes").delete().eq("id", world.classroom.id);
    expect(error?.code).toBe(refused);
    expect((await readClass(world.classroom.id)).id).toBe(world.classroom.id);
  });

  it("classes delete: anon cannot delete the class", async () => {
    const { error } = await anon.from("classes").delete().eq("id", world.classroom.id);
    expect(error?.code).toBe(refused);
    expect((await readClass(world.classroom.id)).id).toBe(world.classroom.id);
  });
});

describe("class_join_code", () => {
  it("class_join_code: the owner gets the ten character code", async () => {
    const { data, error } = await world.teacher.client.rpc("class_join_code", { target_class: world.classroom.id });
    expect(error).toBeNull();
    expect(data).toMatch(joinCodePattern);
    expect(data).toBe(world.classroom.join_code);
  });

  it("class_join_code: an enrolled student, another teacher and the outsider get null", async () => {
    for (const actor of [world.studentA, world.otherTeacher, world.outsider]) {
      const { data, error } = await actor.client.rpc("class_join_code", { target_class: world.classroom.id });
      expect(error).toBeNull();
      expect(data).toBeNull();
    }
  });

  it("class_join_code: anon is refused", async () => {
    const { data, error } = await anon.rpc("class_join_code", { target_class: world.classroom.id });
    expect(error?.code).toBe(refused);
    expect(data).toBeNull();
  });

  it("class_join_code: two new classes get different codes", async () => {
    const created = await world.teacher.client
      .from("classes")
      .insert([
        { code: "COMP 016", title: "Web Development", teacher_id: world.teacher.id },
        { code: "COMP 034", title: "Intro to Data Science", teacher_id: world.teacher.id },
      ])
      .select("id");
    expect(created.error).toBeNull();
    const codes = await Promise.all(
      created.data!.map((row) => world.teacher.client.rpc("class_join_code", { target_class: row.id })),
    );
    expect(codes[0].data).toMatch(joinCodePattern);
    expect(codes[1].data).toMatch(joinCodePattern);
    expect(codes[0].data).not.toBe(codes[1].data);
  });
});
