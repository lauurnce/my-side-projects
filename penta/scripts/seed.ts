import { existsSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { buildDocx, buildPdf, buildPptx } from "../tests/fixtures/deck-files.ts";
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
const deckBucket = "decks";
const pdfType = "application/pdf";
const pptxType = "application/vnd.openxmlformats-officedocument.presentationml.presentation";
const sampleDecks = [
  {
    id: "5e9a0000-0000-4000-8000-0000000d0001",
    title: "Roles and privileges: slides",
    kind: "pdf",
    lesson_id: sampleLessons[1].id,
    slide_count: 12,
    pdf: buildPdf(12, 150000),
    original: null,
  },
  {
    id: "5e9a0000-0000-4000-8000-0000000d0002",
    title: "Backup strategies",
    kind: "native",
    lesson_id: null,
    slide_count: 6,
    pdf: buildPdf(6),
    original: buildPptx(),
  },
];
const finishedDeck = sampleDecks[0];
const minuteMs = 60 * 1000;
const dayMs = 24 * 60 * minuteMs;
const quizDueDays = 7;
const sampleQuizzes = [
  {
    id: "5e9a0000-0000-4000-8000-0000000a0001",
    title: "Roles and privileges check",
    instructions_md: "Five questions on roles and privileges. Finish the slides first. You have 15 minutes and two attempts.",
    lesson_id: sampleLessons[1].id,
    requires_deck_id: finishedDeck.id,
    attempt_limit: 2,
    time_limit_min: 15,
    show_answers: "after_due",
    due_in_days: quizDueDays,
    published: true,
    questions: [
      {
        id: "5e9a0000-0000-4000-8000-0000000a0101",
        kind: "mcq",
        prompt: "Which statement gives a role a privilege on a table?",
        options: ["GRANT", "REVOKE", "ALTER ROLE", "CREATE ROLE"],
        key: 0,
      },
      {
        id: "5e9a0000-0000-4000-8000-0000000a0102",
        kind: "mcq",
        prompt: "A reporting tool only reads the enrollments table. Which privilege should its role get on that table?",
        options: ["ALL PRIVILEGES", "SELECT", "UPDATE", "TRUNCATE"],
        key: 1,
      },
      {
        id: "5e9a0000-0000-4000-8000-0000000a0103",
        kind: "tf",
        prompt: "A role can be a member of another role and use the privileges of that role.",
        options: null,
        key: true,
      },
      {
        id: "5e9a0000-0000-4000-8000-0000000a0104",
        kind: "tf",
        prompt: "Sharing the superuser password with the whole team is a safe way to manage access.",
        options: null,
        key: false,
      },
      {
        id: "5e9a0000-0000-4000-8000-0000000a0105",
        kind: "ident",
        prompt: "Which statement takes a privilege away from a role?",
        options: null,
        key: ["REVOKE"],
      },
    ],
  },
  {
    id: "5e9a0000-0000-4000-8000-0000000a0002",
    title: "Backups check",
    instructions_md: "Two questions on logical backups.",
    lesson_id: sampleLessons[2].id,
    requires_deck_id: null,
    attempt_limit: 1,
    time_limit_min: null,
    show_answers: "never",
    due_in_days: null,
    published: false,
    questions: [
      {
        id: "5e9a0000-0000-4000-8000-0000000a0201",
        kind: "tf",
        prompt: "A backup that has never been restored is already proven to work.",
        options: null,
        key: false,
      },
      {
        id: "5e9a0000-0000-4000-8000-0000000a0202",
        kind: "ident",
        prompt: "Which command line tool writes a logical backup of one PostgreSQL database?",
        options: null,
        key: ["pg_dump"],
      },
    ],
  },
];
const sampleAttempt = {
  id: "5e9a0000-0000-4000-8000-0000000a1001",
  quiz: sampleQuizzes[0],
  started_minutes_ago: 30,
  minutes_taken: 9,
  answers: [
    { answer: 0, is_correct: true },
    { answer: 0, is_correct: false },
    { answer: true, is_correct: true },
    { answer: false, is_correct: true },
    { answer: "revoke", is_correct: true },
  ],
};
const submissionBucket = "submissions";
const docxType = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const hourMs = 60 * minuteMs;
const essayDueDays = 5;
const backupPlanDueDaysAgo = 2;
const classStartDaysAgo = 30;
const sampleUploads = [
  {
    id: "5e9a0000-0000-4000-8000-0000000b0001",
    title: "Access review essay",
    instructions_md:
      "Write a one page review of who can read and who can write each table in a small schema of your choice. Name the roles, list their privileges, and point out one privilege you would revoke. Hand in a PDF or a DOCX.",
    lesson_id: sampleLessons[1].id,
    points: 20,
    due_offset_ms: essayDueDays * dayMs,
  },
  {
    id: "5e9a0000-0000-4000-8000-0000000b0002",
    title: "Backup plan",
    instructions_md:
      "Describe a backup plan for the class database: what is backed up, how often, where the copies are kept, and how you would test a restore. Hand in a PDF or a DOCX.",
    lesson_id: null,
    points: 10,
    due_offset_ms: -backupPlanDueDaysAgo * dayMs,
  },
];
const essayUpload = sampleUploads[0];
const backupPlanUpload = sampleUploads[1];
const sampleSubmissions = [
  {
    id: "5e9a0000-0000-4000-8000-0000000c0001",
    upload_id: "5e9a0000-0000-4000-8000-0000000c1001",
    activity: essayUpload,
    student: 0,
    extension: "pdf",
    mime: pdfType,
    file_name: "access-review-ana-reyes.pdf",
    bytes: buildPdf(1, 20000),
    submitted_offset_ms: -2 * hourMs,
    grade: {
      log_id: "5e9a0000-0000-4000-8000-0000000c2001",
      score: 17,
      feedback:
        "Clear tables and a sensible split between the reader and the writer roles. Say why the reporting role still needs usage on the schema.",
      graded_offset_ms: -hourMs,
    },
  },
  {
    id: "5e9a0000-0000-4000-8000-0000000c0002",
    upload_id: "5e9a0000-0000-4000-8000-0000000c1002",
    activity: essayUpload,
    student: 1,
    extension: "docx",
    mime: docxType,
    file_name: "access-review-ben-cruz.docx",
    bytes: buildDocx({ paddingBytes: 12000 }),
    submitted_offset_ms: -30 * minuteMs,
    grade: null,
  },
  {
    id: "5e9a0000-0000-4000-8000-0000000c0003",
    upload_id: "5e9a0000-0000-4000-8000-0000000c1003",
    activity: backupPlanUpload,
    student: 1,
    extension: "pdf",
    mime: pdfType,
    file_name: "backup-plan-ben-cruz.pdf",
    bytes: buildPdf(2, 8000),
    submitted_offset_ms: backupPlanUpload.due_offset_ms + dayMs,
    grade: null,
  },
];
const rolesLesson = sampleLessons[1];
const rolesQuiz = sampleQuizzes[0];
const sampleThreads = [
  {
    id: "5e9a0000-0000-4000-8000-0000000e0001",
    title: "Why does a role need usage on a schema?",
    lesson_id: rolesLesson.id,
    activity_id: null,
    target_title: rolesLesson.title,
    locked_minutes_ago: null,
    posts: [
      {
        id: "5e9a0000-0000-4000-8000-0000000e0101",
        author: 0,
        parent: null,
        minutes_ago: 50,
        hidden_minutes_ago: null,
        body: [
          "I ran `grant select` on the table for my reporting role, but the query still fails with permission denied.",
          "",
          "- The role can log in",
          "- The grant on the table is there",
          "",
          "Why does it also need usage on the schema?",
        ].join("\n"),
      },
      {
        id: "5e9a0000-0000-4000-8000-0000000e0102",
        author: "teacher",
        parent: null,
        minutes_ago: 44,
        hidden_minutes_ago: null,
        body: "A schema is like a folder. Usage lets the role look inside the folder, and select lets it read one table in it. Without usage the role cannot reach the table at all, so the table grant never gets checked.",
      },
      {
        id: "5e9a0000-0000-4000-8000-0000000e0103",
        author: 1,
        parent: "5e9a0000-0000-4000-8000-0000000e0102",
        minutes_ago: 39,
        hidden_minutes_ago: null,
        body: "That fixed mine too. I had the table grant but not the schema one.",
      },
      {
        id: "5e9a0000-0000-4000-8000-0000000e0104",
        author: 2,
        parent: "5e9a0000-0000-4000-8000-0000000e0102",
        minutes_ago: 35,
        hidden_minutes_ago: 30,
        body: "Just give the role superuser and stop asking, it is faster.",
      },
    ],
  },
  {
    id: "5e9a0000-0000-4000-8000-0000000e0002",
    title: "Is the quiz timed?",
    lesson_id: null,
    activity_id: rolesQuiz.id,
    target_title: rolesQuiz.title,
    locked_minutes_ago: 15,
    posts: [
      {
        id: "5e9a0000-0000-4000-8000-0000000e0201",
        author: 1,
        parent: null,
        minutes_ago: 25,
        hidden_minutes_ago: null,
        body: "Does the timer start when I open the quiz, or when I answer the first question?",
      },
      {
        id: "5e9a0000-0000-4000-8000-0000000e0202",
        author: "teacher",
        parent: null,
        minutes_ago: 20,
        hidden_minutes_ago: null,
        body: "It starts when you press Start. You have 15 minutes and two attempts.",
      },
    ],
  },
];
const hideEventId = "5e9a0000-0000-4000-8000-0000000e1001";

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

async function listStored(folder: string) {
  const { data, error } = await admin.storage.from(deckBucket).list(folder, { limit: 1000 });
  if (error) fail(`Seed stopped: could not list the stored deck files (${error.message}).`);
  return data;
}

async function clearDecks(classId: string) {
  const removedRows = await admin.from("decks").delete().eq("class_id", classId);
  if (removedRows.error) fail(`Seed stopped: could not clear the decks (${removedRows.error.message}).`);

  const names: string[] = [];
  for (const deckFolder of await listStored(classId)) {
    const folder = `${classId}/${deckFolder.name}`;
    if (deckFolder.id) names.push(folder);
    else names.push(...(await listStored(folder)).map((file) => `${folder}/${file.name}`));
  }
  if (names.length === 0) return;
  const removedFiles = await admin.storage.from(deckBucket).remove(names);
  if (removedFiles.error) fail(`Seed stopped: could not clear the stored deck files (${removedFiles.error.message}).`);
}

async function storeDeckFile(path: string, bytes: Uint8Array, contentType: string) {
  const { error } = await admin.storage.from(deckBucket).upload(path, bytes, { contentType, upsert: false });
  if (error) fail(`Seed stopped: could not store ${path} (${error.message}).`);
}

async function saveDeck(sampleDeck: (typeof sampleDecks)[number], classId: string, createdBy: string) {
  const { pdf, original, ...columns } = sampleDeck;
  const folder = `${classId}/${sampleDeck.id}`;
  const pdfPath = `${folder}/slides.pdf`;
  const originalPath = original ? `${folder}/original.pptx` : null;
  await storeDeckFile(pdfPath, pdf, pdfType);
  if (original && originalPath) await storeDeckFile(originalPath, original, pptxType);

  const { error } = await admin.from("decks").insert({
    ...columns,
    class_id: classId,
    pdf_path: pdfPath,
    original_path: originalPath,
    size_bytes: pdf.length + (original?.length ?? 0),
    created_by: createdBy,
    ready_at: new Date().toISOString(),
  });
  if (error) fail(`Seed stopped: could not save the deck "${sampleDeck.title}" (${error.message}).`);
}

async function clearThreads(classId: string) {
  const found = await admin.from("threads").select("id").eq("class_id", classId);
  if (found.error) fail(`Seed stopped: could not list the threads (${found.error.message}).`);
  const threadIds = found.data.map((thread) => thread.id);
  if (threadIds.length === 0) return;
  const posts = await admin.from("posts").select("id").in("thread_id", threadIds);
  if (posts.error) fail(`Seed stopped: could not list the posts (${posts.error.message}).`);
  const postIds = posts.data.map((post) => post.id);
  if (postIds.length > 0) {
    const removedEvents = await admin.from("post_events").delete().in("post_id", postIds);
    if (removedEvents.error) fail(`Seed stopped: could not clear the post events (${removedEvents.error.message}).`);
  }
  const removedReplies = await admin.from("posts").delete().in("thread_id", threadIds).not("parent_id", "is", null);
  if (removedReplies.error) fail(`Seed stopped: could not clear the replies (${removedReplies.error.message}).`);
  const removedPosts = await admin.from("posts").delete().in("thread_id", threadIds);
  if (removedPosts.error) fail(`Seed stopped: could not clear the posts (${removedPosts.error.message}).`);
  const removedThreads = await admin.from("threads").delete().in("id", threadIds);
  if (removedThreads.error) fail(`Seed stopped: could not clear the threads (${removedThreads.error.message}).`);
}

async function saveThread(
  sampleThread: (typeof sampleThreads)[number],
  classId: string,
  teacherAccountId: string,
  studentAccountIds: string[],
  names: Map<string, string>,
  now: number,
) {
  const ago = (minutes: number) => new Date(now - minutes * minuteMs).toISOString();
  const authorOf = (author: number | string) => (typeof author === "number" ? studentAccountIds[author] : teacherAccountId);
  const [question] = sampleThread.posts;
  const locked = sampleThread.locked_minutes_ago;
  const savedThread = await admin.from("threads").insert({
    id: sampleThread.id,
    class_id: classId,
    lesson_id: sampleThread.lesson_id,
    activity_id: sampleThread.activity_id,
    title: sampleThread.title,
    created_by: authorOf(question.author),
    created_at: ago(question.minutes_ago),
    locked: locked !== null,
    locked_by: locked === null ? null : teacherAccountId,
    locked_at: locked === null ? null : ago(locked),
  });
  if (savedThread.error) fail(`Seed stopped: could not save the thread "${sampleThread.title}" (${savedThread.error.message}).`);

  for (const [index, post] of sampleThread.posts.entries()) {
    const authorId = authorOf(post.author);
    const hidden = post.hidden_minutes_ago;
    const savedPost = await admin.from("posts").insert({
      id: post.id,
      thread_id: sampleThread.id,
      author_id: authorId,
      author_name: names.get(authorId) ?? "Student",
      body: post.body,
      parent_id: post.parent,
      is_question: index === 0,
      created_at: ago(post.minutes_ago),
      hidden_at: hidden === null ? null : ago(hidden),
      hidden_by: hidden === null ? null : teacherAccountId,
    });
    if (savedPost.error) fail(`Seed stopped: could not save a post in "${sampleThread.title}" (${savedPost.error.message}).`);
    if (hidden === null) continue;
    const savedEvent = await admin
      .from("post_events")
      .insert({ id: hideEventId, post_id: post.id, actor_id: teacherAccountId, kind: "hide", happened_at: ago(hidden) });
    if (savedEvent.error) fail(`Seed stopped: could not save the hide event (${savedEvent.error.message}).`);
  }
}

async function clearQuizzes(classId: string) {
  const found = await admin.from("activities").select("id").eq("class_id", classId);
  if (found.error) fail(`Seed stopped: could not list the quizzes (${found.error.message}).`);
  const activityIds = found.data.map((activity) => activity.id);
  if (activityIds.length === 0) return;
  const removedAttempts = await admin.from("quiz_attempts").delete().in("activity_id", activityIds);
  if (removedAttempts.error) fail(`Seed stopped: could not clear the quiz attempts (${removedAttempts.error.message}).`);
  const removedQuizzes = await admin.from("activities").delete().in("id", activityIds);
  if (removedQuizzes.error) fail(`Seed stopped: could not clear the quizzes (${removedQuizzes.error.message}).`);
}

async function saveQuiz(sampleQuiz: (typeof sampleQuizzes)[number], classId: string, createdBy: string) {
  const { questions, published, due_in_days, ...columns } = sampleQuiz;
  const savedQuiz = await admin.from("activities").insert({
    ...columns,
    class_id: classId,
    created_by: createdBy,
    due_at: due_in_days ? new Date(Date.now() + due_in_days * dayMs).toISOString() : null,
  });
  if (savedQuiz.error) fail(`Seed stopped: could not save the quiz "${sampleQuiz.title}" (${savedQuiz.error.message}).`);

  const savedQuestions = await admin.from("quiz_questions").insert(
    questions.map((question, index) => ({
      id: question.id,
      activity_id: sampleQuiz.id,
      kind: question.kind,
      prompt: question.prompt,
      options: question.options,
      points: 1,
      position: index + 1,
    })),
  );
  if (savedQuestions.error) fail(`Seed stopped: could not save the quiz questions (${savedQuestions.error.message}).`);

  const savedKeys = await admin
    .from("quiz_answer_keys")
    .insert(questions.map((question) => ({ question_id: question.id, answers: question.key })));
  if (savedKeys.error) fail(`Seed stopped: could not save the answer keys (${savedKeys.error.message}).`);

  if (!published) return;
  const publishedNow = await admin.from("activities").update({ published_at: new Date().toISOString() }).eq("id", sampleQuiz.id);
  if (publishedNow.error) fail(`Seed stopped: could not publish the quiz "${sampleQuiz.title}" (${publishedNow.error.message}).`);
}

async function listStoredSubmissions(folder: string): Promise<string[]> {
  const { data, error } = await admin.storage.from(submissionBucket).list(folder, { limit: 1000 });
  if (error) fail(`Seed stopped: could not list the stored submission files (${error.message}).`);
  const names: string[] = [];
  for (const entry of data) {
    const name = `${folder}/${entry.name}`;
    if (entry.id) names.push(name);
    else names.push(...(await listStoredSubmissions(name)));
  }
  return names;
}

async function clearSubmissions(classId: string) {
  const found = await admin.from("activities").select("id").eq("class_id", classId);
  if (found.error) fail(`Seed stopped: could not list the activities (${found.error.message}).`);
  const activityIds = found.data.map((activity) => activity.id);
  if (activityIds.length > 0) {
    for (const table of ["submissions", "submission_uploads", "submission_grade_log"] as const) {
      const removed = await admin.from(table).delete().in("activity_id", activityIds);
      if (removed.error) fail(`Seed stopped: could not clear ${table} (${removed.error.message}).`);
    }
  }
  const names = await listStoredSubmissions(classId);
  if (names.length === 0) return;
  const removedFiles = await admin.storage.from(submissionBucket).remove(names);
  if (removedFiles.error) fail(`Seed stopped: could not clear the stored submission files (${removedFiles.error.message}).`);
}

async function saveUpload(sampleUpload: (typeof sampleUploads)[number], classId: string, createdBy: string, now: number) {
  const { due_offset_ms, ...columns } = sampleUpload;
  const saved = await admin.from("activities").insert({
    ...columns,
    type: "upload",
    class_id: classId,
    created_by: createdBy,
    due_at: new Date(now + due_offset_ms).toISOString(),
  });
  if (saved.error) fail(`Seed stopped: could not save the activity "${sampleUpload.title}" (${saved.error.message}).`);
  const publishedNow = await admin.from("activities").update({ published_at: new Date(now).toISOString() }).eq("id", sampleUpload.id);
  if (publishedNow.error) fail(`Seed stopped: could not publish the activity "${sampleUpload.title}" (${publishedNow.error.message}).`);
}

async function saveSubmission(
  sample: (typeof sampleSubmissions)[number],
  classId: string,
  studentId: string,
  gradedBy: string,
  now: number,
) {
  const path = `${classId}/${sample.activity.id}/${studentId}/${sample.upload_id}.${sample.extension}`;
  const files = admin.storage.from(submissionBucket);
  const stored = await files.upload(path, sample.bytes, { contentType: sample.mime, upsert: false });
  if (stored.error) fail(`Seed stopped: could not store ${sample.file_name} (${stored.error.message}).`);
  const details = await files.info(path);
  if (details.error) fail(`Seed stopped: could not read back ${sample.file_name} (${details.error.message}).`);

  const submittedAt = now + sample.submitted_offset_ms;
  const gradedAt = sample.grade ? new Date(now + sample.grade.graded_offset_ms).toISOString() : null;
  const file = {
    file_path: path,
    file_name: sample.file_name,
    size_bytes: sample.bytes.length,
    file_etag: details.data.etag ?? null,
  };
  const saved = await admin.from("submissions").insert({
    ...file,
    id: sample.id,
    activity_id: sample.activity.id,
    student_id: studentId,
    upload_id: sample.upload_id,
    mime: sample.mime,
    submitted_at: new Date(submittedAt).toISOString(),
    is_late: submittedAt >= now + sample.activity.due_offset_ms,
    score: sample.grade?.score ?? null,
    feedback: sample.grade?.feedback ?? null,
    graded_by: sample.grade ? gradedBy : null,
    graded_at: gradedAt,
  });
  if (saved.error) fail(`Seed stopped: could not save the submission ${sample.file_name} (${saved.error.message}).`);
  if (!sample.grade || !gradedAt) return;

  const logged = await admin.from("submission_grade_log").insert({
    ...file,
    id: sample.grade.log_id,
    submission_id: sample.id,
    activity_id: sample.activity.id,
    student_id: studentId,
    old_score: null,
    new_score: sample.grade.score,
    feedback: sample.grade.feedback,
    graded_by: gradedBy,
    graded_at: gradedAt,
  });
  if (logged.error) fail(`Seed stopped: could not save the grade log (${logged.error.message}).`);
}

async function saveAttempt(studentId: string) {
  const { quiz, answers } = sampleAttempt;
  const startedAt = Date.now() - sampleAttempt.started_minutes_ago * minuteMs;
  const submittedAt = new Date(startedAt + sampleAttempt.minutes_taken * minuteMs).toISOString();
  const savedAttempt = await admin.from("quiz_attempts").insert({
    id: sampleAttempt.id,
    activity_id: quiz.id,
    student_id: studentId,
    attempt_no: 1,
    started_at: new Date(startedAt).toISOString(),
    expires_at: new Date(startedAt + (quiz.time_limit_min ?? 0) * minuteMs).toISOString(),
    submitted_at: submittedAt,
    score: answers.filter((given) => given.is_correct).length,
    max_score: quiz.questions.length,
  });
  if (savedAttempt.error) fail(`Seed stopped: could not save the quiz attempt (${savedAttempt.error.message}).`);

  const savedAnswers = await admin.from("quiz_attempt_answers").insert(
    answers.map((given, index) => ({
      attempt_id: sampleAttempt.id,
      question_id: quiz.questions[index].id,
      answer: given.answer,
      is_correct: given.is_correct,
      saved_at: submittedAt,
    })),
  );
  if (savedAnswers.error) fail(`Seed stopped: could not save the quiz answers (${savedAnswers.error.message}).`);
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

await clearThreads(routeClassId);
await clearSubmissions(routeClassId);
await clearQuizzes(routeClassId);
await clearDecks(routeClassId);
for (const sampleDeck of sampleDecks) await saveDeck(sampleDeck, routeClassId, teacherId);

const firstViewAt = Date.now() - 60 * minuteMs;
const savedViews = await admin.from("deck_views").upsert(
  Array.from({ length: finishedDeck.slide_count }, (_, index) => ({
    deck_id: finishedDeck.id,
    student_id: studentIds[0],
    slide_no: index + 1,
    viewed_at: new Date(firstViewAt + index * 1000).toISOString(),
  })),
  { onConflict: "deck_id,student_id,slide_no", ignoreDuplicates: true },
);
if (savedViews.error) fail(`Seed stopped: could not save the deck views (${savedViews.error.message}).`);

for (const sampleQuiz of sampleQuizzes) await saveQuiz(sampleQuiz, routeClassId, teacherId);
await saveAttempt(studentIds[0]);

const seededAt = Date.now();
const joinedBeforeDue = await admin
  .from("enrollments")
  .update({ joined_at: new Date(seededAt - classStartDaysAgo * dayMs).toISOString() })
  .eq("class_id", routeClassId)
  .in("student_id", studentIds)
  .gt("joined_at", new Date(seededAt - classStartDaysAgo * dayMs).toISOString());
if (joinedBeforeDue.error) fail(`Seed stopped: could not set the join dates (${joinedBeforeDue.error.message}).`);
for (const sampleUpload of sampleUploads) await saveUpload(sampleUpload, routeClassId, teacherId, seededAt);
for (const sample of sampleSubmissions) {
  await saveSubmission(sample, routeClassId, studentIds[sample.student], teacherId, seededAt);
}

const accountIds = [teacherId, ...studentIds];
const savedNames = await admin.from("profiles").select("id, full_name").in("id", accountIds);
if (savedNames.error) fail(`Seed stopped: could not read the names (${savedNames.error.message}).`);
const namesById = new Map(savedNames.data.map((profile) => [profile.id, profile.full_name]));
for (const sampleThread of sampleThreads) {
  await saveThread(sampleThread, routeClassId, teacherId, studentIds, namesById, seededAt);
}

const savedThreads = await admin.from("threads").select("id, title, locked").eq("class_id", routeClassId);
if (savedThreads.error) fail(`Seed stopped: could not read the threads (${savedThreads.error.message}).`);
const savedPosts = await admin
  .from("posts")
  .select("thread_id, author_name, is_question, hidden_at")
  .in("thread_id", sampleThreads.map((sampleThread) => sampleThread.id));
if (savedPosts.error) fail(`Seed stopped: could not read the posts (${savedPosts.error.message}).`);

const savedSubmissions = await admin
  .from("submissions")
  .select("id, activity_id, student_id, file_name, is_late, score")
  .in("id", sampleSubmissions.map((sample) => sample.id));
if (savedSubmissions.error) fail(`Seed stopped: could not read the submissions (${savedSubmissions.error.message}).`);

const savedDecks = await admin
  .from("decks")
  .select("id, title, kind, slide_count")
  .eq("class_id", routeClassId);
if (savedDecks.error) fail(`Seed stopped: could not read the decks (${savedDecks.error.message}).`);

const savedLessons = await admin
  .from("lessons")
  .select("id, title, published_at")
  .in("id", sampleLessons.map((sampleLesson) => sampleLesson.id));
if (savedLessons.error) fail(`Seed stopped: could not read the lessons (${savedLessons.error.message}).`);

const savedQuizzes = await admin
  .from("activities")
  .select("id, title, type, points, published_at, due_at, attempt_limit, time_limit_min")
  .eq("class_id", routeClassId);
if (savedQuizzes.error) fail(`Seed stopped: could not read the quizzes (${savedQuizzes.error.message}).`);

const savedAttempts = await admin
  .from("quiz_attempts")
  .select("score, max_score")
  .eq("id", sampleAttempt.id)
  .single();
if (savedAttempts.error) fail(`Seed stopped: could not read the quiz attempt (${savedAttempts.error.message}).`);

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
console.log("Decks in COMP 018");
for (const sampleDeck of sampleDecks) {
  const saved = savedDecks.data.find((row) => row.id === sampleDeck.id);
  if (!saved) fail(`Seed stopped: the deck "${sampleDeck.title}" was not saved.`);
  console.log(`  ${saved.title.padEnd(42)}${saved.kind === "native" ? "PPTX and PDF" : "PDF"}, ${saved.slide_count} slides`);
}
console.log("Quizzes in COMP 018");
for (const sampleQuiz of sampleQuizzes) {
  const saved = savedQuizzes.data.find((row) => row.id === sampleQuiz.id);
  if (!saved) fail(`Seed stopped: the quiz "${sampleQuiz.title}" was not saved.`);
  const state = saved.published_at ? "Published" : "Draft";
  const due = saved.due_at ? `, due in ${quizDueDays} days` : "";
  const limit = saved.time_limit_min ? `, ${saved.time_limit_min} minutes` : "";
  console.log(
    `  ${saved.title.padEnd(42)}${state}, ${sampleQuiz.questions.length} questions, ${saved.points} points, attempts allowed ${saved.attempt_limit}${limit}${due}`,
  );
}
console.log(
  `  ${students[0].fullName} has finished "${finishedDeck.title}" and scored ${savedAttempts.data.score} of ${savedAttempts.data.max_score} on "${sampleAttempt.quiz.title}".`,
);
console.log(`  ${students[1].fullName} has not opened the slides, so the quiz is locked for that account.`);
console.log("Upload activities in COMP 018");
for (const sampleUpload of sampleUploads) {
  const saved = savedQuizzes.data.find((row) => row.id === sampleUpload.id);
  if (!saved || saved.type !== "upload") fail(`Seed stopped: the activity "${sampleUpload.title}" was not saved.`);
  const state = saved.published_at ? "Published" : "Draft";
  const due =
    sampleUpload.due_offset_ms > 0 ? `due in ${essayDueDays} days` : `due ${backupPlanDueDaysAgo} days ago`;
  console.log(`  ${saved.title.padEnd(42)}${state}, ${saved.points} points, ${due}`);
  for (const sample of sampleSubmissions.filter((entry) => entry.activity.id === sampleUpload.id)) {
    const row = savedSubmissions.data.find((entry) => entry.id === sample.id);
    if (!row) fail(`Seed stopped: the submission ${sample.file_name} was not saved.`);
    const timing = row.is_late ? "late" : "on time";
    const grade = row.score === null ? "not graded" : `graded ${row.score} of ${saved.points}`;
    console.log(`    ${students[sample.student].fullName.padEnd(16)}${row.file_name.padEnd(34)}${timing}, ${grade}`);
  }
}
console.log(`  ${students[0].fullName} and ${students[2].fullName} have handed in nothing for "${backupPlanUpload.title}".`);
console.log("Threads in COMP 018");
for (const sampleThread of sampleThreads) {
  const saved = savedThreads.data.find((row) => row.id === sampleThread.id);
  if (!saved) fail(`Seed stopped: the thread "${sampleThread.title}" was not saved.`);
  const posts = savedPosts.data.filter((row) => row.thread_id === sampleThread.id);
  const asker = posts.find((row) => row.is_question)?.author_name ?? "nobody";
  const hidden = posts.filter((row) => row.hidden_at).length;
  const state = saved.locked ? "Locked" : "Open";
  const hiddenNote = hidden > 0 ? `, ${hidden} hidden` : "";
  console.log(`  ${saved.title.padEnd(42)}${state}, on "${sampleThread.target_title}", asked by ${asker}`);
  console.log(`    posts under the question: ${posts.length - 1}${hiddenNote}`);
}
