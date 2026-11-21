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
const routeClassId = "5e9a0000-0000-4000-8000-000000000018";
const sampleClasses = [
  {
    id: "5e9a0000-0000-4000-8000-000000000301",
    code: "INTE 301",
    title: "Systems Integration and Architecture 1",
    section: "BSIT 3-1",
    term,
  },
  {
    id: routeClassId,
    code: "COMP 018",
    title: "Database Administration",
    section: "Lab",
    term,
  },
];
const sampleModules = [
  { id: "5e9a0000-0000-4000-8000-000000001801", class_id: routeClassId, title: "Week 1 · Foundations" },
  { id: "5e9a0000-0000-4000-8000-000000001802", class_id: routeClassId, title: "Week 2 · Backups" },
];
const sampleLessons = [
  {
    id: "5e9a0000-0000-4000-8000-000000018101",
    module_id: sampleModules[0].id,
    title: "What a database administrator does",
    est_minutes: 10,
    published: true,
    body_md: [
      "# What a database administrator does",
      "",
      "A database administrator keeps the data available, correct and safe. Most of the work is routine: watch the server, plan for growth, and be ready to restore when something breaks.",
      "",
      "- Install and patch the database server",
      "- Create roles and grant only what each one needs",
      "- Watch disk space, slow queries and locks",
      "- Take backups and test that they restore",
      "",
      "Check which server you are connected to before you change anything:",
      "",
      "```sql",
      "select version();",
      "select current_database(), current_user;",
      "```",
      "",
      "Read more in the [PostgreSQL manual on server administration](https://www.postgresql.org/docs/current/admin.html).",
      "",
    ].join("\n"),
  },
  {
    id: "5e9a0000-0000-4000-8000-000000018102",
    module_id: sampleModules[0].id,
    title: "Roles and privileges",
    est_minutes: 15,
    published: true,
    body_md: [
      "# Roles and privileges",
      "",
      "A role is an account or a group of accounts. A privilege is what a role may do to one object. Start from nothing and add only what the work needs.",
      "",
      "- Give each person and each application its own role",
      "- Grant on tables and columns, not on the whole database",
      "- Revoke what is no longer used",
      "- Never share the superuser password",
      "",
      "A read only role for a reporting tool:",
      "",
      "```sql",
      "create role report_reader login;",
      "grant usage on schema public to report_reader;",
      "grant select on public.enrollments to report_reader;",
      "```",
      "",
      "The full list of privileges is in the [PostgreSQL manual on privileges](https://www.postgresql.org/docs/current/ddl-priv.html).",
      "",
    ].join("\n"),
  },
  {
    id: "5e9a0000-0000-4000-8000-000000018201",
    module_id: sampleModules[1].id,
    title: "Logical backups with pg_dump",
    est_minutes: 20,
    published: true,
    body_md: [
      "# Logical backups with pg_dump",
      "",
      "A logical backup is a file of the commands and data needed to rebuild a database. It is slow for very large databases, but it is simple and it moves between server versions.",
      "",
      "- Use the custom format so you can restore one table",
      "- Keep at least one copy on another machine",
      "- Write down how long the backup and the restore take",
      "- A backup that was never restored is not a backup yet",
      "",
      "Back up one database, then restore it into an empty one:",
      "",
      "```bash",
      "pg_dump --format=custom --file=school.dump school",
      "createdb school_restore",
      "pg_restore --dbname=school_restore school.dump",
      "```",
      "",
      "Every option is listed in the [pg_dump reference](https://www.postgresql.org/docs/current/app-pgdump.html).",
      "",
    ].join("\n"),
  },
  {
    id: "5e9a0000-0000-4000-8000-000000018202",
    module_id: sampleModules[1].id,
    title: "Point in time recovery",
    est_minutes: 25,
    published: false,
    body_md: [
      "# Point in time recovery",
      "",
      "A base backup plus the write ahead log lets you rebuild the database as it was at any moment, for example one minute before a table was dropped by mistake.",
      "",
      "- Turn on log archiving before you need it",
      "- Take a base backup on a schedule",
      "- Keep every log file written since the oldest base backup",
      "- Practise a recovery to a chosen time at least once a term",
      "",
      "The settings that turn on archiving:",
      "",
      "```ini",
      "wal_level = replica",
      "archive_mode = on",
      "archive_command = 'cp %p /var/backups/wal/%f'",
      "```",
      "",
      "The steps are in the [PostgreSQL manual on continuous archiving](https://www.postgresql.org/docs/current/continuous-archiving.html).",
      "",
    ].join("\n"),
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

for (const sampleModule of sampleModules) {
  const { error } = await admin.from("modules").upsert(sampleModule, { onConflict: "id", ignoreDuplicates: true });
  if (error) fail(`Seed stopped: could not save the modules (${error.message}).`);
}

for (const { published, ...sampleLesson } of sampleLessons) {
  const { error } = await admin.from("lessons").upsert(sampleLesson, { onConflict: "id", ignoreDuplicates: true });
  if (error) fail(`Seed stopped: could not save the lessons (${error.message}).`);
  if (!published) continue;
  const publishedNow = await admin
    .from("lessons")
    .update({ published_at: new Date().toISOString() })
    .eq("id", sampleLesson.id)
    .is("published_at", null);
  if (publishedNow.error) fail(`Seed stopped: could not publish the lessons (${publishedNow.error.message}).`);
}

const savedProgress = await admin
  .from("lesson_progress")
  .upsert(
    { lesson_id: sampleLessons[0].id, student_id: studentIds[0] },
    { onConflict: "lesson_id,student_id", ignoreDuplicates: true },
  );
if (savedProgress.error) fail(`Seed stopped: could not save the lesson progress (${savedProgress.error.message}).`);

const savedLessons = await admin
  .from("lessons")
  .select("id, title, published_at")
  .in("id", sampleLessons.map((sampleLesson) => sampleLesson.id));
if (savedLessons.error) fail(`Seed stopped: could not read the lessons (${savedLessons.error.message}).`);

console.log("Local sample accounts");
for (const account of [teacher, ...students]) {
  console.log(`  ${account.role.padEnd(8)}${account.email.padEnd(24)}${account.fullName}`);
}
console.log(`Password for every sample account: ${samplePassword}`);
console.log("Classes");
for (const savedClass of savedClasses.data) {
  console.log(`  ${savedClass.code.padEnd(10)}${savedClass.title.padEnd(42)}${formatJoinCode(savedClass.join_code)}`);
}
console.log("Lessons in COMP 018");
for (const sampleLesson of sampleLessons) {
  const saved = savedLessons.data.find((row) => row.id === sampleLesson.id);
  if (!saved) fail(`Seed stopped: the lesson "${sampleLesson.title}" was not saved.`);
  console.log(`  ${saved.title.padEnd(42)}${saved.published_at ? "Published" : "Draft"}`);
}
