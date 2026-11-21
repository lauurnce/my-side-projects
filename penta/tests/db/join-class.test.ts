import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  admin,
  anon,
  countEnrollments,
  createClass,
  createWorld,
  join,
  removeCreatedUsers,
  unusedJoinCode,
} from "./helpers";

const fifteenMinutes = 15 * 60 * 1000;
let world: Awaited<ReturnType<typeof createWorld>>;

async function readAttemptTimes(userId: string): Promise<number[]> {
  const { data, error } = await admin.from("join_attempts").select("attempted_at").eq("user_id", userId);
  if (error) throw error;
  return data.map((row) => Date.parse(row.attempted_at)).sort((a, b) => a - b);
}

async function recordMisses(userId: string, count: number, attemptedAt = new Date().toISOString()) {
  const rows = Array.from({ length: count }, () => ({ user_id: userId, attempted_at: attemptedAt }));
  const { error } = await admin.from("join_attempts").insert(rows);
  if (error) throw error;
}

beforeAll(async () => {
  world = await createWorld();
});

beforeEach(async () => {
  const studentIds = [world.studentA.id, world.studentB.id, world.outsider.id];
  const { error } = await admin.from("join_attempts").delete().in("user_id", studentIds);
  if (error) throw error;
});

afterAll(removeCreatedUsers);

describe("join_class", () => {
  it("join_class: a right code gives joined", async () => {
    const target = await createClass(world.teacher.id);
    const { result, error } = await join(world.studentA.client, target.join_code);
    expect(error).toBeNull();
    expect(result).toEqual({ status: "joined", class_id: target.id });
    expect(await countEnrollments(target.id, world.studentA.id)).toBe(1);

    const visible = await world.studentA.client.from("classes").select("id").eq("id", target.id);
    expect(visible.data).toEqual([{ id: target.id }]);
  });

  it("join_class: the same code again gives already", async () => {
    const target = await createClass(world.teacher.id);
    expect((await join(world.studentA.client, target.join_code)).result?.status).toBe("joined");
    const again = await join(world.studentA.client, target.join_code);
    expect(again.result).toEqual({ status: "already", class_id: target.id });
    expect(await countEnrollments(target.id, world.studentA.id)).toBe(1);
    expect(await readAttemptTimes(world.studentA.id)).toEqual([]);
  });

  it("join_class: lower case with a hyphen and spaces works", async () => {
    const target = await createClass(world.teacher.id);
    const lower = target.join_code.toLowerCase();
    const typed = `  ${lower.slice(0, 5)} - ${lower.slice(5, 8)} ${lower.slice(8)}  `;
    const { result } = await join(world.studentA.client, typed);
    expect(result).toEqual({ status: "joined", class_id: target.id });
    expect(await countEnrollments(target.id, world.studentA.id)).toBe(1);
  });

  it("join_class: a wrong well-formed code gives invalid and is counted", async () => {
    const { result, error } = await join(world.studentA.client, unusedJoinCode());
    expect(error).toBeNull();
    expect(result).toEqual({ status: "invalid" });
    expect(await readAttemptTimes(world.studentA.id)).toHaveLength(1);
  });

  it("join_class: a short value gives malformed and is not counted", async () => {
    for (const typed of ["ABC", "", "ABCDEFGHJKL", "0000000000", "ABCDEFGHI!"]) {
      const { result, error } = await join(world.studentA.client, typed);
      expect(error).toBeNull();
      expect(result).toEqual({ status: "malformed" });
    }
    expect(await readAttemptTimes(world.studentA.id)).toEqual([]);
  });

  it("join_class: a teacher gets not_student", async () => {
    const target = await createClass(world.teacher.id);
    for (const actor of [world.teacher, world.otherTeacher]) {
      const { result, error } = await join(actor.client, target.join_code);
      expect(error).toBeNull();
      expect(result).toEqual({ status: "not_student" });
      expect(await countEnrollments(target.id, actor.id)).toBe(0);
    }
  });

  it("join_class: anon is refused", async () => {
    const target = await createClass(world.teacher.id);
    const { result, error } = await join(anon, target.join_code);
    expect(error !== null || result?.status === "signed_out").toBe(true);
    expect(result?.class_id).toBeUndefined();
    const { count } = await admin
      .from("enrollments")
      .select("*", { count: "exact", head: true })
      .eq("class_id", target.id);
    expect(count).toBe(0);
  });

  it("join_class: after five wrong codes the sixth call gives limited and even the right code is limited", async () => {
    const target = await createClass(world.teacher.id);
    const startedAt = Date.now();
    for (let miss = 0; miss < 5; miss += 1) {
      expect((await join(world.studentA.client, unusedJoinCode())).result).toEqual({ status: "invalid" });
    }
    const firstMissDoneBy = Date.now();

    const sixth = await join(world.studentA.client, unusedJoinCode());
    expect(sixth.result?.status).toBe("limited");
    const attempts = await readAttemptTimes(world.studentA.id);
    expect(attempts).toHaveLength(5);
    const retryAt = Date.parse(sixth.result!.retry_at!);
    expect(retryAt).toBe(attempts[0] + fifteenMinutes);
    expect(retryAt).toBeGreaterThan(startedAt + fifteenMinutes - 60000);
    expect(retryAt).toBeLessThan(firstMissDoneBy + fifteenMinutes + 60000);

    const withRightCode = await join(world.studentA.client, target.join_code);
    expect(withRightCode.result?.status).toBe("limited");
    expect(withRightCode.result?.class_id).toBeUndefined();
    expect(await countEnrollments(target.id, world.studentA.id)).toBe(0);
    expect(await readAttemptTimes(world.studentA.id)).toHaveLength(5);
  });

  it("join_class: one student's limit does not affect another student", async () => {
    const target = await createClass(world.teacher.id);
    await recordMisses(world.studentA.id, 5);
    expect((await join(world.studentA.client, target.join_code)).result?.status).toBe("limited");
    expect((await join(world.studentB.client, target.join_code)).result).toEqual({
      status: "joined",
      class_id: target.id,
    });
  });

  it("join_class: misses older than fifteen minutes no longer count", async () => {
    const target = await createClass(world.teacher.id);
    await recordMisses(world.studentA.id, 5, new Date(Date.now() - fifteenMinutes - 60000).toISOString());
    const { result } = await join(world.studentA.client, target.join_code);
    expect(result).toEqual({ status: "joined", class_id: target.id });
    expect(await readAttemptTimes(world.studentA.id)).toEqual([]);
  });

  it("join_class: two parallel joins with the right code leave exactly one enrollment row", async () => {
    const target = await createClass(world.teacher.id);
    const outcomes = await Promise.all([
      join(world.studentA.client, target.join_code),
      join(world.studentA.client, target.join_code),
    ]);
    expect(outcomes.map((outcome) => outcome.result?.status).sort()).toEqual(["already", "joined"]);
    expect(await countEnrollments(target.id, world.studentA.id)).toBe(1);
  });

  it("join_class: parallel wrong codes never record more than five misses", async () => {
    const outcomes = await Promise.all(
      Array.from({ length: 8 }, () => join(world.studentA.client, unusedJoinCode())),
    );
    const statuses = outcomes.map((outcome) => outcome.result?.status);
    expect(statuses.filter((status) => status === "invalid")).toHaveLength(5);
    expect(statuses.filter((status) => status === "limited")).toHaveLength(3);
    expect(await readAttemptTimes(world.studentA.id)).toHaveLength(5);
  });
});
