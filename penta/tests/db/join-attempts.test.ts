import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { admin, anon, createWorld, refused, removeCreatedUsers } from "./helpers";

let world: Awaited<ReturnType<typeof createWorld>>;
let seededAt: string;

async function readAttempts() {
  const { data, error } = await admin
    .from("join_attempts")
    .select("user_id, attempted_at")
    .eq("user_id", world.studentA.id);
  if (error) throw error;
  return data;
}

function apiClients() {
  return [world.studentA.client, world.teacher.client, anon];
}

beforeAll(async () => {
  world = await createWorld();
  const seeded = await admin
    .from("join_attempts")
    .insert({ user_id: world.studentA.id })
    .select("attempted_at")
    .single();
  if (seeded.error) throw seeded.error;
  seededAt = seeded.data.attempted_at;
});

afterAll(removeCreatedUsers);

describe("join_attempts", () => {
  it("join_attempts select: a student, a teacher and anon are refused", async () => {
    for (const client of apiClients()) {
      const { data, error } = await client.from("join_attempts").select("user_id");
      expect(error?.code).toBe(refused);
      expect(data).toBeNull();
    }
  });

  it("join_attempts insert: a student, a teacher and anon are refused", async () => {
    for (const client of apiClients()) {
      const { error } = await client.from("join_attempts").insert({ user_id: world.studentA.id });
      expect(error?.code).toBe(refused);
    }
    expect(await readAttempts()).toEqual([{ user_id: world.studentA.id, attempted_at: seededAt }]);
  });

  it("join_attempts update: a student, a teacher and anon are refused", async () => {
    for (const client of apiClients()) {
      const { error } = await client
        .from("join_attempts")
        .update({ attempted_at: "2020-01-01T00:00:00Z" })
        .eq("user_id", world.studentA.id);
      expect(error?.code).toBe(refused);
    }
    expect(await readAttempts()).toEqual([{ user_id: world.studentA.id, attempted_at: seededAt }]);
  });

  it("join_attempts delete: a student, a teacher and anon are refused", async () => {
    for (const client of apiClients()) {
      const { error } = await client.from("join_attempts").delete().eq("user_id", world.studentA.id);
      expect(error?.code).toBe(refused);
    }
    expect(await readAttempts()).toEqual([{ user_id: world.studentA.id, attempted_at: seededAt }]);
  });
});
