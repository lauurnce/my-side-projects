import "./guard";
import { randomInt, randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../src/lib/database.types";

export type Client = SupabaseClient<Database>;
export type Actor = { id: string; email: string; client: Client };
export type JoinResult = { status: string; class_id?: string; retry_at?: string };

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const sessionless = { auth: { persistSession: false, autoRefreshToken: false } };
const testEmailSuffix = "@penta.test";
const joinCodeAlphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const createdUserIds: string[] = [];

export const refused = "42501";
export const checkFailed = "23514";
export const joinCodePattern = /^[A-HJ-NP-Z2-9]{10}$/;
export const testPassword = randomUUID();
export const admin = createClient<Database>(url, serviceRoleKey, sessionless);
export const anon = createAnonClient();

export function createAnonClient(): Client {
  return createClient<Database>(url, anonKey, sessionless);
}

export function testEmail(name: string): string {
  return `${name}-${randomUUID().slice(0, 8)}${testEmailSuffix}`;
}

export function trackUser(id: string) {
  createdUserIds.push(id);
}

export async function createActor(name: string, role?: "teacher"): Promise<Actor> {
  const email = testEmail(name);
  const created = await admin.auth.admin.createUser({
    email,
    password: testPassword,
    email_confirm: true,
    app_metadata: role ? { role } : undefined,
  });
  if (created.error) throw created.error;
  trackUser(created.data.user.id);

  const client = createAnonClient();
  const signedIn = await client.auth.signInWithPassword({ email, password: testPassword });
  if (signedIn.error) throw signedIn.error;
  return { id: created.data.user.id, email, client };
}

export async function createClass(teacherId: string, title = "Systems Integration and Architecture 1") {
  const { data, error } = await admin
    .from("classes")
    .insert({ code: "INTE 301", title, section: "BSIT 3-1", term: "1st sem", teacher_id: teacherId })
    .select("id, title, teacher_id, join_code")
    .single();
  if (error) throw error;
  return data;
}

export async function readClass(classId: string) {
  const { data, error } = await admin
    .from("classes")
    .select("id, code, title, teacher_id, join_code")
    .eq("id", classId)
    .single();
  if (error) throw error;
  return data;
}

export async function readProfile(userId: string) {
  const { data, error } = await admin.from("profiles").select("id, full_name, role").eq("id", userId).single();
  if (error) throw error;
  return data;
}

export async function enroll(classId: string, studentId: string) {
  const { error } = await admin.from("enrollments").insert({ class_id: classId, student_id: studentId });
  if (error) throw error;
}

export async function countEnrollments(classId: string, studentId: string): Promise<number> {
  const { count, error } = await admin
    .from("enrollments")
    .select("*", { count: "exact", head: true })
    .eq("class_id", classId)
    .eq("student_id", studentId);
  if (error) throw error;
  return count ?? 0;
}

export async function createWorld() {
  const [teacher, otherTeacher, studentA, studentB, outsider] = await Promise.all([
    createActor("teacher", "teacher"),
    createActor("other-teacher", "teacher"),
    createActor("student-a"),
    createActor("student-b"),
    createActor("outsider"),
  ]);
  const classroom = await createClass(teacher.id);
  await enroll(classroom.id, studentA.id);
  await enroll(classroom.id, studentB.id);
  return { teacher, otherTeacher, studentA, studentB, outsider, classroom };
}

export async function join(client: Client, code: string) {
  const { data, error } = await client.rpc("join_class", { code });
  return { result: data as JoinResult | null, error };
}

export function unusedJoinCode(): string {
  return Array.from({ length: 10 }, () => joinCodeAlphabet[randomInt(joinCodeAlphabet.length)]).join("");
}

export async function removeCreatedUsers() {
  await removeUsers(createdUserIds.splice(0));
}

export async function sweepTestUsers() {
  const leftovers: string[] = [];
  for (let page = 1; ; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    if (data.users.length === 0) break;
    leftovers.push(...data.users.filter((user) => user.email?.endsWith(testEmailSuffix)).map((user) => user.id));
  }
  await removeUsers(leftovers);
}

async function removeUsers(userIds: string[]) {
  if (userIds.length === 0) return;
  const classes = await admin.from("classes").delete().in("teacher_id", userIds);
  if (classes.error) throw classes.error;
  for (const userId of userIds) {
    const { error } = await admin.auth.admin.deleteUser(userId);
    if (error) throw error;
  }
}
