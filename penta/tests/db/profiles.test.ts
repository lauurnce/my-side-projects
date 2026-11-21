import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { admin, anon, checkFailed, createWorld, readProfile, refused, removeCreatedUsers } from "./helpers";

let world: Awaited<ReturnType<typeof createWorld>>;

beforeAll(async () => {
  world = await createWorld();
});

afterAll(removeCreatedUsers);

describe("profiles select", () => {
  it("profiles select: a user reads their own row", async () => {
    const { data, error } = await world.studentA.client
      .from("profiles")
      .select("id, full_name, role")
      .eq("id", world.studentA.id);
    expect(error).toBeNull();
    expect(data).toEqual([
      { id: world.studentA.id, full_name: world.studentA.email.split("@")[0], role: "student" },
    ]);
  });

  it("profiles select: a teacher reads a student enrolled in their class", async () => {
    const { data, error } = await world.teacher.client.from("profiles").select("id, role").eq("id", world.studentA.id);
    expect(error).toBeNull();
    expect(data).toEqual([{ id: world.studentA.id, role: "student" }]);
  });

  it("profiles select: a teacher cannot read the outsider", async () => {
    const { data, error } = await world.teacher.client.from("profiles").select("id").eq("id", world.outsider.id);
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it("profiles select: another teacher cannot read a student they do not teach", async () => {
    const { data, error } = await world.otherTeacher.client.from("profiles").select("id").eq("id", world.studentA.id);
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it("profiles select: a student reads their teacher", async () => {
    const { data, error } = await world.studentA.client.from("profiles").select("id, role").eq("id", world.teacher.id);
    expect(error).toBeNull();
    expect(data).toEqual([{ id: world.teacher.id, role: "teacher" }]);
  });

  it("profiles select: a student cannot read a classmate", async () => {
    const { data, error } = await world.studentA.client.from("profiles").select("id").eq("id", world.studentB.id);
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it("profiles select: a student listing every profile gets only themself and their teacher", async () => {
    const { data, error } = await world.studentA.client.from("profiles").select("id");
    expect(error).toBeNull();
    expect(data?.map((row) => row.id).sort()).toEqual([world.studentA.id, world.teacher.id].sort());
  });

  it("profiles select: the outsider listing every profile gets only themself", async () => {
    const { data, error } = await world.outsider.client.from("profiles").select("id");
    expect(error).toBeNull();
    expect(data).toEqual([{ id: world.outsider.id }]);
  });

  it("profiles select: anon reads nothing", async () => {
    const { data, error } = await anon.from("profiles").select("id");
    expect(error?.code).toBe(refused);
    expect(data).toBeNull();
  });

  it("profiles select: nobody can select created_at", async () => {
    for (const client of [world.studentA.client, world.teacher.client, anon]) {
      const named = await client.from("profiles").select("created_at");
      expect(named.error?.code).toBe(refused);
      expect(named.data).toBeNull();
      const everything = await client.from("profiles").select("*");
      expect(everything.error?.code).toBe(refused);
      expect(everything.data).toBeNull();
    }
  });
});

describe("profiles update", () => {
  it("profiles update: a user updates their own full_name", async () => {
    const { data, error } = await world.studentB.client
      .from("profiles")
      .update({ full_name: "Bea Santos" })
      .eq("id", world.studentB.id)
      .select("full_name");
    expect(error).toBeNull();
    expect(data).toEqual([{ full_name: "Bea Santos" }]);
    expect((await readProfile(world.studentB.id)).full_name).toBe("Bea Santos");
  });

  it("profiles update: a 120 character name is accepted", async () => {
    const longestName = "n".repeat(120);
    const { error } = await world.outsider.client
      .from("profiles")
      .update({ full_name: longestName })
      .eq("id", world.outsider.id);
    expect(error).toBeNull();
    expect((await readProfile(world.outsider.id)).full_name).toBe(longestName);
  });

  it("profiles update: a user cannot update a classmate they cannot see", async () => {
    const before = await readProfile(world.studentB.id);
    const { data, error } = await world.studentA.client
      .from("profiles")
      .update({ full_name: "Renamed by a classmate" })
      .eq("id", world.studentB.id)
      .select("id");
    expect(error).toBeNull();
    expect(data).toEqual([]);
    expect(await readProfile(world.studentB.id)).toEqual(before);
  });

  it("profiles update: a teacher cannot update a student they can see", async () => {
    const before = await readProfile(world.studentA.id);
    const { data, error } = await world.teacher.client
      .from("profiles")
      .update({ full_name: "Renamed by the teacher" })
      .eq("id", world.studentA.id)
      .select("id");
    expect(error).toBeNull();
    expect(data).toEqual([]);
    expect(await readProfile(world.studentA.id)).toEqual(before);
  });

  it("profiles update: a student cannot update their teacher", async () => {
    const before = await readProfile(world.teacher.id);
    const { data, error } = await world.studentA.client
      .from("profiles")
      .update({ full_name: "Renamed by a student" })
      .eq("id", world.teacher.id)
      .select("id");
    expect(error).toBeNull();
    expect(data).toEqual([]);
    expect(await readProfile(world.teacher.id)).toEqual(before);
  });

  it("profiles update: anon is refused", async () => {
    const before = await readProfile(world.studentA.id);
    const { error } = await anon.from("profiles").update({ full_name: "Renamed by nobody" }).eq("id", world.studentA.id);
    expect(error?.code).toBe(refused);
    expect(await readProfile(world.studentA.id)).toEqual(before);
  });

  it("profiles update: a student cannot set role to teacher", async () => {
    const roleOnly = await world.studentA.client.from("profiles").update({ role: "teacher" }).eq("id", world.studentA.id);
    expect(roleOnly.error?.code).toBe(refused);
    const withName = await world.studentA.client
      .from("profiles")
      .update({ full_name: "Still A Student", role: "teacher" })
      .eq("id", world.studentA.id);
    expect(withName.error?.code).toBe(refused);
    const after = await readProfile(world.studentA.id);
    expect(after.role).toBe("student");
    expect(after.full_name).not.toBe("Still A Student");
  });

  it("profiles update: a student cannot set role to teacher with an upsert on id", async () => {
    const before = await readProfile(world.studentA.id);
    const { error } = await world.studentA.client
      .from("profiles")
      .upsert({ id: world.studentA.id, full_name: before.full_name, role: "teacher" }, { onConflict: "id" });
    expect(error?.code).toBe(refused);
    expect(await readProfile(world.studentA.id)).toEqual(before);
  });

  it("profiles update: a user cannot change their id", async () => {
    const { error } = await world.studentA.client.from("profiles").update({ id: randomUUID() }).eq("id", world.studentA.id);
    expect(error?.code).toBe(refused);
    expect((await readProfile(world.studentA.id)).id).toBe(world.studentA.id);
  });

  it("profiles update: a full_name with a right-to-left override character is refused", async () => {
    const before = await readProfile(world.studentA.id);
    const { error } = await world.studentA.client
      .from("profiles")
      .update({ full_name: "Ana ‮gnp.exe" })
      .eq("id", world.studentA.id);
    expect(error?.code).toBe(checkFailed);
    expect(await readProfile(world.studentA.id)).toEqual(before);
  });

  it("profiles update: a 121 character name is refused", async () => {
    const before = await readProfile(world.studentA.id);
    const { error } = await world.studentA.client
      .from("profiles")
      .update({ full_name: "n".repeat(121) })
      .eq("id", world.studentA.id);
    expect(error?.code).toBe(checkFailed);
    expect(await readProfile(world.studentA.id)).toEqual(before);
  });

  it("profiles update: an empty name and a padded name are refused", async () => {
    const before = await readProfile(world.studentA.id);
    for (const full_name of ["", " Ana "]) {
      const { error } = await world.studentA.client.from("profiles").update({ full_name }).eq("id", world.studentA.id);
      expect(error?.code).toBe(checkFailed);
    }
    expect(await readProfile(world.studentA.id)).toEqual(before);
  });
});

describe("profiles insert and delete", () => {
  it("profiles insert: a user cannot insert a second profile", async () => {
    const secondId = randomUUID();
    for (const client of [world.studentA.client, world.teacher.client, anon]) {
      const { error } = await client.from("profiles").insert({ id: secondId, full_name: "Second Profile", role: "teacher" });
      expect(error?.code).toBe(refused);
    }
    const { data } = await admin.from("profiles").select("id").eq("id", secondId);
    expect(data).toEqual([]);
  });

  it("profiles delete: a user cannot delete their profile", async () => {
    for (const actor of [world.studentA, world.teacher]) {
      const { error } = await actor.client.from("profiles").delete().eq("id", actor.id);
      expect(error?.code).toBe(refused);
      expect((await readProfile(actor.id)).id).toBe(actor.id);
    }
  });

  it("profiles delete: anon cannot delete a profile", async () => {
    const { error } = await anon.from("profiles").delete().eq("id", world.studentA.id);
    expect(error?.code).toBe(refused);
    expect((await readProfile(world.studentA.id)).id).toBe(world.studentA.id);
  });
});
