import { existsSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../src/lib/database.types.ts";
import { formatJoinCode } from "../src/lib/join-code.ts";
import { assertLocalSupabase } from "../src/lib/supabase/local.ts";

type Account = { email: string; fullName: string; role: "teacher" | "student" };

if (existsSync(".env.local")) process.loadEnvFile(".env.local");

const samplePassword = "penta-local-2026";
const term = "1st sem, AY 2026-27";
const teacher: Account = { email: "teacher@penta.local", fullName: "Maria Santos", role: "teacher" };
const students: Account[] = [
  { email: "student1@penta.local", fullName: "Ana Reyes", role: "student" },
  { email: "student2@penta.local", fullName: "Ben Cruz", role: "student" },
  { email: "student3@penta.local", fullName: "Carla Dizon", role: "student" },
];
const sampleClasses = [
  {
    id: "5e9a0000-0000-4000-8000-000000000301",
    code: "INTE 301",
    title: "Systems Integration and Architecture 1",
    section: "BSIT 3-1",
    term,
  },
  {
    id: "5e9a0000-0000-4000-8000-000000000018",
    code: "COMP 018",
    title: "Database Administration",
    section: "Lab",
    term,
  },
];

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

function localUrl(): string {
  try {
    return assertLocalSupabase(process.env.NEXT_PUBLIC_SUPABASE_URL);
  } catch {
    return fail("Seed stopped: it runs only against the local development database (127.0.0.1 or localhost).");
  }
}

const url = localUrl();
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!serviceRoleKey) fail("Seed stopped: SUPABASE_SERVICE_ROLE_KEY is not set in .env.local.");

const admin = createClient<Database>(url, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function listUserIdsByEmail(): Promise<Map<string, string>> {
  const idsByEmail = new Map<string, string>();
  for (let page = 1; ; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) fail(`Seed stopped: could not list users (${error.message}).`);
    if (data.users.length === 0) return idsByEmail;
    for (const user of data.users) {
      if (user.email) idsByEmail.set(user.email, user.id);
    }
  }
}

async function ensureAccount(account: Account, existing: Map<string, string>): Promise<string> {
  const existingId = existing.get(account.email);
  if (existingId) return existingId;

  const { data, error } = await admin.auth.admin.createUser({
    email: account.email,
    password: samplePassword,
    email_confirm: true,
    user_metadata: { full_name: account.fullName },
    app_metadata: account.role === "teacher" ? { role: "teacher" } : undefined,
  });
  if (error) fail(`Seed stopped: could not create ${account.email} (${error.message}).`);
  return data.user.id;
}

const existing = await listUserIdsByEmail();
const teacherId = await ensureAccount(teacher, existing);
const studentIds: string[] = [];
for (const student of students) studentIds.push(await ensureAccount(student, existing));

const savedClasses = await admin
  .from("classes")
  .upsert(
    sampleClasses.map((sampleClass) => ({ ...sampleClass, teacher_id: teacherId })),
    { onConflict: "id" },
  )
  .select("id, code, title, join_code")
  .order("code");
if (savedClasses.error) fail(`Seed stopped: could not save the classes (${savedClasses.error.message}).`);

const savedEnrollments = await admin.from("enrollments").upsert(
  sampleClasses.flatMap((sampleClass) =>
    studentIds.map((studentId) => ({ class_id: sampleClass.id, student_id: studentId })),
  ),
  { onConflict: "class_id,student_id", ignoreDuplicates: true },
);
if (savedEnrollments.error) fail(`Seed stopped: could not save the enrollments (${savedEnrollments.error.message}).`);

console.log("Local sample accounts");
for (const account of [teacher, ...students]) {
  console.log(`  ${account.role.padEnd(8)}${account.email.padEnd(24)}${account.fullName}`);
}
console.log(`Password for every sample account: ${samplePassword}`);
console.log("Classes");
for (const savedClass of savedClasses.data) {
  console.log(`  ${savedClass.code.padEnd(10)}${savedClass.title.padEnd(42)}${formatJoinCode(savedClass.join_code)}`);
}
