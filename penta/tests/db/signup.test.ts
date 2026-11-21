import { afterAll, describe, expect, it } from "vitest";
import {
  admin,
  createActor,
  createAnonClient,
  readProfile,
  refused,
  removeCreatedUsers,
  testEmail,
  testPassword,
  trackUser,
} from "./helpers";

afterAll(removeCreatedUsers);

async function signUp(data: Record<string, string>) {
  const client = createAnonClient();
  const signedUp = await client.auth.signUp({ email: testEmail("signup"), password: testPassword, options: { data } });
  if (signedUp.error || !signedUp.data.user) throw signedUp.error ?? new Error("sign up returned no user");
  trackUser(signedUp.data.user.id);
  return { id: signedUp.data.user.id, client, session: signedUp.data.session };
}

describe("sign-up trigger", () => {
  it("sign-up trigger: a sign-up that asks for the teacher role is a student", async () => {
    const user = await signUp({ role: "teacher", full_name: "X" });
    expect(await readProfile(user.id)).toEqual({ id: user.id, full_name: "X", role: "student" });
    expect(user.session).not.toBeNull();
    const created = await user.client
      .from("classes")
      .insert({ code: "INTE 301", title: "Opened by a self-made teacher", teacher_id: user.id });
    expect(created.error?.code).toBe(refused);
  });

  it("sign-up trigger: an admin-created user with no metadata gets a profile named after the email", async () => {
    const actor = await createActor("plain");
    expect(await readProfile(actor.id)).toEqual({
      id: actor.id,
      full_name: actor.email.split("@")[0],
      role: "student",
    });
  });

  it("sign-up trigger: an admin-created user with the teacher role in app metadata is a teacher", async () => {
    const actor = await createActor("made-teacher", "teacher");
    expect((await readProfile(actor.id)).role).toBe("teacher");
  });

  it("sign-up trigger: a name with direction and control characters is cleaned, not refused", async () => {
    const user = await signUp({ full_name: "  Ana ‮\u0007Reyes  " });
    expect((await readProfile(user.id)).full_name).toBe("Ana Reyes");
  });

  it("sign-up trigger: a name longer than 120 characters is cut to 120", async () => {
    const user = await signUp({ full_name: "n".repeat(300) });
    expect((await readProfile(user.id)).full_name).toBe("n".repeat(120));
  });

  it("role sync: setting app_metadata.role to teacher makes the profile a teacher and removing it makes a student", async () => {
    const actor = await createActor("promoted");
    expect((await readProfile(actor.id)).role).toBe("student");

    const promoted = await admin.auth.admin.updateUserById(actor.id, { app_metadata: { role: "teacher" } });
    expect(promoted.error).toBeNull();
    expect((await readProfile(actor.id)).role).toBe("teacher");

    const demoted = await admin.auth.admin.updateUserById(actor.id, { app_metadata: { role: null } });
    expect(demoted.error).toBeNull();
    expect(demoted.data.user?.app_metadata.role).toBeUndefined();
    expect((await readProfile(actor.id)).role).toBe("student");
  });

  it("role sync: a user who sets role in their own user metadata stays a student", async () => {
    const actor = await createActor("self-promoted");
    const updated = await actor.client.auth.updateUser({ data: { role: "teacher" } });
    expect(updated.error).toBeNull();
    expect(updated.data.user?.user_metadata.role).toBe("teacher");
    expect(updated.data.user?.app_metadata.role).toBeUndefined();
    expect((await readProfile(actor.id)).role).toBe("student");

    await actor.client.auth.refreshSession();
    const created = await actor.client
      .from("classes")
      .insert({ code: "INTE 301", title: "Opened by a self-promoted user", teacher_id: actor.id });
    expect(created.error?.code).toBe(refused);
  });
});
