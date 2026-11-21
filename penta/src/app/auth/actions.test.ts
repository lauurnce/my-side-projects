import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  signUp: vi.fn(),
  signInWithPassword: vi.fn(),
  signOut: vi.fn(),
  createUser: vi.fn(),
  revalidatePath: vi.fn(),
  redirect: vi.fn((path: string) => {
    throw new Error(`redirect:${path}`);
  }),
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { signUp: mocks.signUp, signInWithPassword: mocks.signInWithPassword, signOut: mocks.signOut },
  }),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ auth: { admin: { createUser: mocks.createUser } } }),
}));

import { logIn, signOut, signUp } from "./actions";

const teacherCode = "correct-teacher-code-for-tests";
const password = "  pass word 1 ";

function form(fields: Record<string, string>) {
  const formData = new FormData();
  for (const [name, value] of Object.entries(fields)) formData.set(name, value);
  return formData;
}

function signUpForm(fields: Record<string, string> = {}) {
  return form({ email: " Ana@PUP.edu.ph ", fullName: " Ana Reyes ", password, teacherCode: "", ...fields });
}

beforeEach(() => {
  vi.stubEnv("TEACHER_SIGNUP_CODE", teacherCode);
  mocks.signUp.mockResolvedValue({ data: { session: { access_token: "token" } }, error: null });
  mocks.signInWithPassword.mockResolvedValue({ data: {}, error: null });
  mocks.signOut.mockResolvedValue({ error: null });
  mocks.createUser.mockResolvedValue({ data: { user: { id: "user-1" } }, error: null });
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("signUp as a student", () => {
  it("signs up with the cleaned email and name, then goes to the hub", async () => {
    await expect(signUp({}, signUpForm())).rejects.toThrow("redirect:/hub");
    expect(mocks.signUp).toHaveBeenCalledWith({
      email: "ana@pup.edu.ph",
      password,
      options: { data: { full_name: "Ana Reyes" } },
    });
    expect(mocks.createUser).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/", "layout");
  });

  it("never sends a role, even when the form carries one", async () => {
    await expect(signUp({}, signUpForm({ role: "teacher" }))).rejects.toThrow("redirect:/hub");
    expect(JSON.stringify(mocks.signUp.mock.calls)).not.toContain("teacher");
  });

  it("returns field errors and creates nothing when the input is bad", async () => {
    const state = await signUp({}, signUpForm({ email: "ana", password: "short" }));
    expect(state.fieldErrors?.email).toBeTruthy();
    expect(state.fieldErrors?.password).toBeTruthy();
    expect(mocks.signUp).not.toHaveBeenCalled();
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it("asks to confirm the email when no session comes back", async () => {
    mocks.signUp.mockResolvedValue({ data: { session: null }, error: null });
    const state = await signUp({}, signUpForm());
    expect(state).toEqual({ notice: "Check your email to confirm your account" });
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it("maps a failure to the fixed message", async () => {
    mocks.signUp.mockResolvedValue({ data: {}, error: { status: 422, message: "User already registered" } });
    const state = await signUp({}, signUpForm());
    expect(state.error).toBe("Could not create the account");
    expect(JSON.stringify(state)).not.toContain("already registered");
  });

  it("maps status 429 to the rate limit message", async () => {
    mocks.signUp.mockResolvedValue({ data: {}, error: { status: 429, message: "rate limit" } });
    expect((await signUp({}, signUpForm())).error).toBe("Too many attempts. Try again in a few minutes.");
  });

  it("maps a thrown error to the fixed message", async () => {
    mocks.signUp.mockRejectedValue(new TypeError("fetch failed"));
    expect((await signUp({}, signUpForm())).error).toBe("Could not create the account");
  });

  it("echoes the email and the name but never the password", async () => {
    mocks.signUp.mockResolvedValue({ data: {}, error: { status: 500 } });
    const state = await signUp({}, signUpForm());
    expect(state.values).toEqual({ email: "Ana@PUP.edu.ph", fullName: "Ana Reyes" });
    expect(JSON.stringify(state)).not.toContain(password);
  });
});

describe("signUp with a teacher code", () => {
  it("refuses a wrong code with the generic field error and creates no account", async () => {
    const state = await signUp({}, signUpForm({ teacherCode: "wrong-teacher-code-wrong" }));
    expect(state.fieldErrors).toEqual({ teacherCode: "That teacher code is not valid" });
    expect(mocks.createUser).not.toHaveBeenCalled();
    expect(mocks.signUp).not.toHaveBeenCalled();
    expect(JSON.stringify(state)).not.toContain("wrong-teacher-code-wrong");
    expect(JSON.stringify(state)).not.toContain(password);
  });

  it("refuses every code when the server has no teacher code", async () => {
    vi.stubEnv("TEACHER_SIGNUP_CODE", "");
    const state = await signUp({}, signUpForm({ teacherCode }));
    expect(state.fieldErrors?.teacherCode).toBe("That teacher code is not valid");
    expect(mocks.createUser).not.toHaveBeenCalled();
  });

  it("creates a confirmed teacher with the admin client, signs in and goes to the hub", async () => {
    await expect(signUp({}, signUpForm({ teacherCode }))).rejects.toThrow("redirect:/hub");
    expect(mocks.createUser).toHaveBeenCalledWith({
      email: "ana@pup.edu.ph",
      password,
      email_confirm: true,
      user_metadata: { full_name: "Ana Reyes" },
      app_metadata: { role: "teacher" },
    });
    expect(mocks.signInWithPassword).toHaveBeenCalledWith({ email: "ana@pup.edu.ph", password });
    expect(mocks.signUp).not.toHaveBeenCalled();
  });

  it("maps a failed create to the fixed message and does not sign in", async () => {
    mocks.createUser.mockResolvedValue({ data: { user: null }, error: { status: 422, message: "email_exists" } });
    const state = await signUp({}, signUpForm({ teacherCode }));
    expect(state.error).toBe("Could not create the account");
    expect(mocks.signInWithPassword).not.toHaveBeenCalled();
    expect(JSON.stringify(state)).not.toContain(teacherCode);
  });

  it("points to the login page when the account exists but the sign-in failed", async () => {
    mocks.signInWithPassword.mockResolvedValue({ data: {}, error: { status: 500 } });
    const state = await signUp({}, signUpForm({ teacherCode }));
    expect(state).toEqual({ notice: "Account created. Log in to continue." });
  });
});

describe("logIn", () => {
  const credentials = { email: " Ana@PUP.edu.ph", password };

  it("signs in and goes to the hub by default", async () => {
    await expect(logIn({}, form(credentials))).rejects.toThrow("redirect:/hub");
    expect(mocks.signInWithPassword).toHaveBeenCalledWith({ email: "ana@pup.edu.ph", password });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/", "layout");
  });

  it("goes to a safe next path", async () => {
    await expect(logIn({}, form({ ...credentials, next: "/classes/abc?tab=people" }))).rejects.toThrow(
      "redirect:/classes/abc?tab=people",
    );
  });

  it.each(["https://evil.example", "//evil.example", "/login", "/\\evil.example"])(
    "falls back to the hub for the next value %s",
    async (next) => {
      await expect(logIn({}, form({ ...credentials, next }))).rejects.toThrow("redirect:/hub");
    },
  );

  it("returns the fixed message on wrong credentials and echoes only the email", async () => {
    mocks.signInWithPassword.mockResolvedValue({ data: {}, error: { status: 400, message: "Invalid login credentials" } });
    const state = await logIn({}, form(credentials));
    expect(state).toEqual({ error: "Email or password is incorrect", values: { email: "Ana@PUP.edu.ph" } });
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it("maps status 429 to the rate limit message", async () => {
    mocks.signInWithPassword.mockResolvedValue({ data: {}, error: { status: 429 } });
    expect((await logIn({}, form(credentials))).error).toBe("Too many attempts. Try again in a few minutes.");
  });

  it("does not call Supabase when the input is bad", async () => {
    const state = await logIn({}, form({ email: "ana", password: "" }));
    expect(Object.keys(state.fieldErrors ?? {}).sort()).toEqual(["email", "password"]);
    expect(mocks.signInWithPassword).not.toHaveBeenCalled();
  });
});

describe("signOut", () => {
  it("signs out this device only and goes to the login page", async () => {
    await expect(signOut()).rejects.toThrow("redirect:/login");
    expect(mocks.signOut).toHaveBeenCalledWith({ scope: "local" });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/", "layout");
  });
});
