"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { safeNext } from "@/lib/safe-next";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { isTeacherCode } from "@/lib/teacher-code";
import { firstFieldErrors, logInSchema, signUpSchema } from "./schemas";
import type { AuthState } from "./schemas";

type SignUpInput = { email: string; fullName: string; password: string };
type Outcome = { state: AuthState } | { signedIn: true };

const signUpFailed = "Could not create the account";
const logInFailed = "Email or password is incorrect";
const tooManyAttempts = "Too many attempts. Try again in a few minutes.";
const teacherCodeInvalid = "That teacher code is not valid";
const confirmEmail = "Check your email to confirm your account";
const createdLogIn = "Account created. Log in to continue.";

function text(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

function echoed(formData: FormData): AuthState["values"] {
  return {
    email: text(formData, "email").trim().slice(0, 254),
    fullName: text(formData, "fullName").trim().slice(0, 120),
  };
}

function failure(error: { status?: number }, fallback: string): string {
  return error.status === 429 ? tooManyAttempts : fallback;
}

async function createStudent({ email, fullName, password }: SignUpInput, values: AuthState["values"]): Promise<Outcome> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { full_name: fullName } },
  });
  if (error) return { state: { error: failure(error, signUpFailed), values } };
  if (!data.session) return { state: { notice: confirmEmail } };
  return { signedIn: true };
}

async function createTeacher({ email, fullName, password }: SignUpInput, values: AuthState["values"]): Promise<Outcome> {
  const { error: createError } = await createAdminClient().auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName },
    app_metadata: { role: "teacher" },
  });
  if (createError) return { state: { error: failure(createError, signUpFailed), values } };

  const supabase = await createClient();
  const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
  if (signInError) return { state: { notice: createdLogIn } };
  return { signedIn: true };
}

async function attemptSignUp(formData: FormData): Promise<Outcome> {
  const values = echoed(formData);
  const parsed = signUpSchema.safeParse({
    email: text(formData, "email"),
    fullName: text(formData, "fullName"),
    password: text(formData, "password"),
    teacherCode: text(formData, "teacherCode"),
  });
  if (!parsed.success) return { state: { fieldErrors: firstFieldErrors(parsed.error), values } };

  const { teacherCode, ...input } = parsed.data;
  if (!teacherCode) return createStudent(input, values);
  if (!isTeacherCode(teacherCode, process.env.TEACHER_SIGNUP_CODE)) {
    return { state: { fieldErrors: { teacherCode: teacherCodeInvalid }, values } };
  }
  return createTeacher(input, values);
}

async function attemptLogIn(formData: FormData): Promise<Outcome> {
  const values = { email: echoed(formData)?.email };
  const parsed = logInSchema.safeParse({ email: text(formData, "email"), password: text(formData, "password") });
  if (!parsed.success) return { state: { fieldErrors: firstFieldErrors(parsed.error), values } };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) return { state: { error: failure(error, logInFailed), values } };
  return { signedIn: true };
}

async function settled(attempt: Promise<Outcome>, fallback: string, formData: FormData): Promise<Outcome> {
  try {
    return await attempt;
  } catch {
    return { state: { error: fallback, values: echoed(formData) } };
  }
}

export async function signUp(_previousState: AuthState, formData: FormData): Promise<AuthState> {
  const outcome = await settled(attemptSignUp(formData), signUpFailed, formData);
  if ("state" in outcome) return outcome.state;
  revalidatePath("/", "layout");
  redirect("/hub");
}

export async function logIn(_previousState: AuthState, formData: FormData): Promise<AuthState> {
  const outcome = await settled(attemptLogIn(formData), logInFailed, formData);
  if ("state" in outcome) return outcome.state;
  revalidatePath("/", "layout");
  redirect(safeNext(formData.get("next")));
}

export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut({ scope: "local" });
  revalidatePath("/", "layout");
  redirect("/login");
}
