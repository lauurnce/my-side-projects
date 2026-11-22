import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { expect, test, type Page, type Response } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { assertLocalSupabase } from "../src/lib/supabase/local";

if (existsSync(".env.local")) process.loadEnvFile(".env.local");

const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const password = `pw-${randomUUID()}`;
const createdEmails: string[] = [];
const keyMarker = "zebra-key-7781";
const secondKeyMarker = "quokka-key-4420";
const keyFieldNames = ["is_correct", "isCorrect", "accepted", "key_answers", "quiz_answer_keys"];
const textTypes = ["text/", "json", "javascript", "x-component"];

test.skip(!serviceRoleKey, "needs the local development database");
test.setTimeout(120000);

function adminClient() {
  const url = assertLocalSupabase(process.env.NEXT_PUBLIC_SUPABASE_URL);
  return createClient(url, serviceRoleKey!, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function createUser(name: string, role: "teacher" | "student") {
  const email = `${name.toLowerCase().replace(/\s+/g, "-")}-${randomUUID().slice(0, 8)}@penta.test`;
  createdEmails.push(email);
  const { data, error } = await adminClient().auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: name },
    app_metadata: role === "teacher" ? { role } : {},
  });
  if (error) throw error;
  return { id: data.user.id, email, name };
}

async function logIn(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("School email").fill(email);
  await page.getByLabel(/^Password/).fill(password);
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page).toHaveURL(/\/hub$/);
}

async function saveQuestion(page: Page, kind: string, prompt: string, fill: () => Promise<void>) {
  await page.getByRole("button", { name: "Add question" }).click();
  await page.getByLabel("Kind").selectOption({ label: kind });
  await page.getByLabel("Question", { exact: true }).fill(prompt);
  await page.getByLabel("Points").fill("1");
  await fill();
  await page.getByRole("button", { name: "Save question" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Question saved" })).toBeVisible();
}

test.afterAll(async () => {
  const admin = adminClient();
  const { data } = await admin.auth.admin.listUsers({ perPage: 1000 });
  const ids = (data?.users ?? []).filter((user) => createdEmails.includes(user.email ?? "")).map((user) => user.id);
  if (ids.length === 0) return;

  const { data: classes } = await admin.from("classes").select("id").in("teacher_id", ids);
  const classIds = (classes ?? []).map((row) => row.id);
  if (classIds.length) {
    const { data: activities } = await admin.from("activities").select("id").in("class_id", classIds);
    const activityIds = (activities ?? []).map((row) => row.id);
    if (activityIds.length) await admin.from("quiz_attempts").delete().in("activity_id", activityIds);
    if (activityIds.length) await admin.from("activities").delete().in("id", activityIds);
    await admin.from("classes").delete().in("id", classIds);
  }
  for (const id of ids) await admin.auth.admin.deleteUser(id);
});

test("a teacher builds a quiz, a student scores 2 of 3, and no key reaches the student", async ({ browser }, testInfo) => {
  const admin = adminClient();
  const teacherUser = await createUser("Quiz Teacher", "teacher");
  const studentUser = await createUser("Quiz Student", "student");
  const quizTitle = `Brokers check ${randomUUID().slice(0, 6)}`;

  const { data: classRow, error: classError } = await admin
    .from("classes")
    .insert({ code: "QZ 101", title: "Quiz Systems", section: "BSIT 3-1", term: "1st sem", teacher_id: teacherUser.id })
    .select("id")
    .single();
  if (classError) throw classError;
  const { error: enrollError } = await admin
    .from("enrollments")
    .insert({ class_id: classRow.id, student_id: studentUser.id });
  if (enrollError) throw enrollError;

  const teacherContext = await browser.newContext({ timezoneId: "America/New_York", locale: "en-GB" });
  const teacher = await teacherContext.newPage();
  await logIn(teacher, teacherUser.email);
  await teacher.goto(`/classes/${classRow.id}`);
  await teacher.getByLabel("Quiz title").fill(quizTitle);
  await teacher.getByRole("button", { name: "New quiz" }).click();
  await expect(teacher).toHaveURL(/\/ops\/[0-9a-f-]{36}$/);
  const quizUrl = teacher.url();
  const activityId = quizUrl.split("/ops/")[1];

  await teacher.getByLabel("Due date").fill("2026-12-31T23:59");
  await teacher.getByRole("button", { name: "Save settings" }).click();
  await expect(teacher.getByRole("status").filter({ hasText: /saved/i }).first()).toBeVisible();
  await teacher.reload();
  await expect(teacher.getByLabel("Due date")).toHaveValue("2026-12-31T23:59");
  const { data: stored } = await admin.from("activities").select("due_at").eq("id", activityId).single();
  expect(new Date(stored!.due_at!).toISOString()).toBe("2026-12-31T15:59:00.000Z");

  await teacher.getByRole("button", { name: "Publish quiz" }).click();
  await expect(teacher.getByText("Add at least one question before publishing.")).toBeVisible();

  await saveQuestion(teacher, "Multiple choice", "Which part sits between a producer and a consumer?", async () => {
    await teacher.getByLabel("Option 1", { exact: true }).fill("Database");
    await teacher.getByLabel("Option 2", { exact: true }).fill("Broker");
    await teacher.getByLabel("Option 3", { exact: true }).fill("Cache");
    await teacher.getByRole("radio", { name: "Correct option 2" }).check();
  });
  await saveQuestion(teacher, "True or false", "A queue delivers each message to every consumer.", async () => {
    await teacher.getByRole("group", { name: "Right answer" }).getByRole("radio", { name: "False" }).check();
  });
  await saveQuestion(teacher, "Identification", "Name the code word your teacher gave for this quiz.", async () => {
    await teacher.getByLabel("Accepted answers").fill(`${keyMarker}\n${secondKeyMarker}`);
  });
  await expect(teacher.getByText(keyMarker)).toBeVisible();

  await teacher.getByRole("button", { name: "Publish quiz" }).click();
  await expect(teacher.getByRole("button", { name: "Unpublish" })).toBeVisible();

  const studentContext = await browser.newContext();
  const student = await studentContext.newPage();
  const bodies: { url: string; type: string; text: string }[] = [];
  const pending: Promise<void>[] = [];
  const record = (response: Response) => {
    const type = response.headers()["content-type"] ?? "";
    if (!textTypes.some((part) => type.includes(part))) return;
    pending.push(
      response
        .text()
        .then((text) => {
          bodies.push({ url: response.url(), type, text });
        })
        .catch(() => undefined),
    );
  };
  studentContext.on("response", record);

  await logIn(student, studentUser.email);
  await student.goto(`/classes/${classRow.id}`);
  const card = student.getByRole("link", { name: new RegExp(quizTitle) });
  await expect(card).toContainText("Due");
  await card.click();
  await expect(student).toHaveURL(new RegExp(`/ops/${activityId}$`));
  await expect(student.getByText("Dec 31, 2026, 11:59 PM, Manila time")).toBeVisible();
  await expect(student.getByText("Which part sits between a producer and a consumer?")).toHaveCount(0);

  await student.getByRole("button", { name: "Start quiz" }).click();
  await expect(student).toHaveURL(/\/attempt\/[0-9a-f-]{36}$/);
  const attemptUrl = student.url();
  const first = student.getByRole("group", { name: /^Question 1/ });
  const second = student.getByRole("group", { name: /^Question 2/ });
  const third = student.getByRole("group", { name: /^Question 3/ });
  await first.getByRole("radio", { name: "Broker" }).check();
  await third.getByLabel("Your answer").fill("request and reply");
  await third.getByLabel("Your answer").blur();
  await expect
    .poll(async () => {
      const { data } = await admin
        .from("quiz_attempt_answers")
        .select("answer")
        .eq("attempt_id", attemptUrl.split("/attempt/")[1]);
      return (data ?? []).map((row) => JSON.stringify(row.answer)).sort();
    })
    .toEqual(['"request and reply"', "1"]);

  await student.reload();
  await expect(first.getByRole("radio", { name: "Broker" })).toBeChecked();
  await expect(third.getByLabel("Your answer")).toHaveValue("request and reply");
  await second.getByRole("radio", { name: "False" }).check();
  await third.getByLabel("Your answer").fill("polling");
  await student.getByRole("button", { name: "Submit quiz" }).click();

  await expect(student.getByText("You scored 2 of 3")).toBeVisible();
  await expect(student.getByText("Your teacher has chosen not to show the answers.")).toBeVisible();
  await expect(student.getByText(/^Correct$|^Incorrect$/)).toHaveCount(0);

  await student.goto(`/ops/${activityId}`);
  await expect(student.getByRole("button", { name: "Start quiz" })).toHaveCount(0);
  await expect(student.getByRole("button", { name: "Continue quiz" })).toHaveCount(0);
  await expect(student.getByText(/no attempts left/i)).toBeVisible();

  await student.goto(`/classes/${classRow.id}`);
  await expect(student.getByRole("link", { name: new RegExp(quizTitle) })).toContainText("Graded · 2 of 3");
  await student.goto("/hub");
  await student.goto(attemptUrl);
  await expect(student.getByText("You scored 2 of 3")).toBeVisible();

  await Promise.all(pending);
  const leaks = bodies.filter(({ url, text }) => {
    const lower = text.toLowerCase();
    if (lower.includes(keyMarker) || lower.includes(secondKeyMarker)) return true;
    return !url.includes("/_next/static/") && keyFieldNames.some((name) => text.includes(name));
  });
  const dataResponses = bodies.filter(({ url }) => !url.includes("/_next/static/")).length;
  const kinds = new Map<string, number>();
  for (const { type } of bodies) kinds.set(type.split(";")[0], (kinds.get(type.split(";")[0]) ?? 0) + 1);
  const summary = `${bodies.length} responses checked for the key values, ${dataResponses} data responses also checked for key field names (${[...kinds].map(([type, count]) => `${count} ${type}`).join(", ")})`;
  console.log(`[${testInfo.project.name}] key scan: ${summary}; leaks ${leaks.length}`);
  testInfo.annotations.push({ type: "key scan", description: summary });
  expect(bodies.length).toBeGreaterThan(20);
  expect(bodies.some(({ url }) => url.includes("/rest/v1/rpc/save_answer"))).toBe(true);
  expect(bodies.some(({ type }) => type.includes("x-component"))).toBe(true);
  expect(
    leaks.map(({ url, type, text }) => {
      const lower = text.toLowerCase();
      const found = [keyMarker, secondKeyMarker].filter((marker) => lower.includes(marker));
      return `${type.split(";")[0]} ${new URL(url).pathname} ${[...found, ...keyFieldNames.filter((name) => text.includes(name))].join(",")}`;
    }),
  ).toEqual([]);

  const { data: attempts } = await admin
    .from("quiz_attempts")
    .select("attempt_no, score, max_score, submitted_at")
    .eq("activity_id", activityId);
  expect(attempts).toHaveLength(1);
  expect(attempts![0]).toMatchObject({ attempt_no: 1, score: 2, max_score: 3 });
  expect(attempts![0].submitted_at).not.toBeNull();

  await teacher.goto(`${quizUrl}/results`);
  const row = teacher.getByRole("row", { name: new RegExp(studentUser.name) });
  await expect(row).toContainText("2 of 3");
  await expect(row).toContainText("66%");
  await expect(teacher.getByText(/1 of 1 correct, 100%/).first()).toBeVisible();
  await expect(teacher.getByText(/0 of 1 correct, 0%/)).toBeVisible();

  await teacherContext.close();
  await studentContext.close();
});
