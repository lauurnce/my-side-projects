import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { assertLocalSupabase } from "../src/lib/supabase/local";

if (existsSync(".env.local")) process.loadEnvFile(".env.local");

const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const password = `pw-${randomUUID()}`;
const createdEmails: string[] = [];

test.skip(!serviceRoleKey, "needs the local development database");
test.setTimeout(180000);

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
  return { id: data.user.id, email };
}

async function logIn(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("School email").fill(email);
  await page.getByLabel(/^Password/).fill(password);
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page).toHaveURL(/\/hub$/);
}

async function addSlide(page: Page, layout: string) {
  await page.getByLabel("Layout").selectOption({ label: layout });
  await page.getByRole("button", { name: "Add slide" }).click();
}

async function retype(page: Page, blockName: string, fieldName: string, text: string) {
  const canvas = page.getByRole("group", { name: "Slide canvas" });
  await canvas.getByRole("button", { name: blockName }).focus();
  await page.keyboard.press("Enter");
  await canvas.getByRole("textbox", { name: fieldName }).fill(text);
  await page.keyboard.press("Enter");
}

function isRequestCancelledByLeaving(error: Error): boolean {
  return /\/rest\/v1\/rpc\/live_state due to access control checks\.$/.test(error.message);
}

function saved(page: Page) {
  return expect(page.getByRole("status").filter({ hasText: /^Saved$/ })).toBeVisible({ timeout: 15000 });
}

test.afterAll(async () => {
  const admin = adminClient();
  const { data } = await admin.auth.admin.listUsers({ perPage: 1000 });
  const ids = (data?.users ?? []).filter((user) => createdEmails.includes(user.email ?? "")).map((user) => user.id);
  if (ids.length === 0) return;

  const { data: classes } = await admin.from("classes").select("id").in("teacher_id", ids);
  const classIds = (classes ?? []).map((row) => row.id);
  if (classIds.length) await admin.from("decks").delete().in("class_id", classIds);
  if (classIds.length) await admin.from("classes").delete().in("id", classIds);
  for (const id of ids) await admin.auth.admin.deleteUser(id);
});

test("a teacher builds a deck, reorders it, presents it live, and a student follows", async ({ browser }) => {
  const admin = adminClient();
  const teacherUser = await createUser("Slide Teacher", "teacher");
  const studentUser = await createUser("Slide Student", "student");
  const deckTitle = `Queues ${randomUUID().slice(0, 6)}`;

  const { data: classRow, error: classError } = await admin
    .from("classes")
    .insert({ code: "SL 101", title: "Slide Systems", section: "BSIT 3-1", term: "1st sem", teacher_id: teacherUser.id })
    .select("id")
    .single();
  if (classError) throw classError;
  const { error: enrollError } = await admin.from("enrollments").insert({ class_id: classRow.id, student_id: studentUser.id });
  if (enrollError) throw enrollError;

  const teacherContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const studentContext = await browser.newContext();
  const teacher = await teacherContext.newPage();
  const student = await studentContext.newPage();
  const pageErrors: string[] = [];
  const keep = (who: string) => (error: Error) => {
    if (!isRequestCancelledByLeaving(error)) pageErrors.push(`${who}: ${error.message}`);
  };
  teacher.on("pageerror", keep("teacher"));
  student.on("pageerror", keep("student"));
  await logIn(teacher, teacherUser.email);
  await logIn(student, studentUser.email);

  await teacher.goto(`/classes/${classRow.id}`);
  await teacher.getByLabel("New deck title").fill(deckTitle);
  await teacher.getByRole("button", { name: "New deck" }).click();
  await expect(teacher).toHaveURL(/\/decks\/[0-9a-f-]{36}\/edit$/);
  const deckId = new URL(teacher.url()).pathname.split("/")[2];
  await expect(teacher.getByRole("heading", { level: 1, name: deckTitle })).toBeVisible();

  await student.goto(`/decks/${deckId}`);
  await expect(student.getByText(deckTitle)).toHaveCount(0);

  await addSlide(teacher, "Three-box diagram");
  await addSlide(teacher, "Two columns");
  await addSlide(teacher, "Title and text");
  await expect(teacher.getByRole("button", { name: /^Duplicate slide/ })).toHaveCount(4);

  await teacher.getByRole("button", { name: "Slide 01", exact: true }).click();
  await retype(teacher, "Title block: Message queues", "Title text", "Queues at work");
  const canvas = teacher.getByRole("group", { name: "Slide canvas" });
  await expect(canvas.getByRole("button", { name: "Title block: Queues at work" })).toBeVisible();

  await teacher.getByRole("button", { name: "Move slide 1 down" }).click();
  await teacher.getByRole("button", { name: "Slide 01", exact: true }).click();
  await expect(canvas.getByRole("button", { name: "Box block: Producer" })).toBeVisible();
  await teacher.getByRole("button", { name: "Slide 02", exact: true }).click();
  await expect(canvas.getByRole("button", { name: "Title block: Queues at work" })).toBeVisible();

  await teacher.keyboard.press("Escape");
  await canvas.getByRole("button", { name: "Title block: Queues at work" }).focus();
  const before = await canvas.getByRole("button", { name: "Title block: Queues at work" }).boundingBox();
  await teacher.keyboard.press("ArrowDown");
  await teacher.keyboard.press("ArrowDown");
  const after = await canvas.getByRole("button", { name: "Title block: Queues at work" }).boundingBox();
  expect(after!.y).toBeGreaterThan(before!.y);
  await teacher.getByRole("button", { name: "Undo" }).click();
  await teacher.getByRole("button", { name: "Undo" }).click();
  const undone = await canvas.getByRole("button", { name: "Title block: Queues at work" }).boundingBox();
  expect(Math.round(undone!.y)).toBe(Math.round(before!.y));

  await saved(teacher);
  await teacher.getByRole("button", { name: "Publish" }).click();
  await expect(teacher.getByRole("link", { name: "Present" })).toBeVisible();

  await student.goto(`/decks/${deckId}`);
  await expect(student.getByText("Slide 1 / 4", { exact: true })).toBeVisible();
  await expect(student.getByText("Producer", { exact: true })).toBeVisible();

  await teacher.getByRole("button", { name: "Slide 01", exact: true }).click();
  await retype(teacher, "Box block: Producer", "Box text", "Sender");
  await teacher.getByRole("link", { name: "Present" }).click();
  await expect(teacher).toHaveURL(new RegExp(`/decks/${deckId}$`));
  await expect(teacher.getByText("Sender", { exact: true })).toBeVisible();

  await teacher.getByRole("button", { name: "Present" }).click();
  await expect(teacher.getByRole("button", { name: "End session" })).toBeVisible();

  await expect(student.getByRole("button", { name: "Join live" })).toBeVisible({ timeout: 40000 });
  await student.getByRole("button", { name: "Join live" }).click();
  await teacher.getByRole("button", { name: "Next slide" }).click();
  await expect(student.getByText("Slide 2 / 4", { exact: true })).toBeVisible({ timeout: 10000 });
  await expect(student.getByText("Queues at work", { exact: true })).toBeVisible();

  await teacher.waitForTimeout(600);
  await teacher.getByRole("button", { name: "Previous slide" }).click();
  await expect(student.getByText("Slide 1 / 4", { exact: true })).toBeVisible({ timeout: 10000 });
  await expect(student.getByText("Sender", { exact: true })).toBeVisible({ timeout: 30000 });
  await expect(student.getByText("Producer", { exact: true })).toHaveCount(0);

  await teacher.getByRole("button", { name: "End session" }).click();
  await expect(teacher.getByRole("button", { name: "Present" })).toBeVisible();
  await expect(student.getByRole("button", { name: "Join live" })).toHaveCount(0, { timeout: 20000 });
  await teacher.goto(`/decks/${deckId}/print`);
  await expect(teacher.getByRole("listitem")).toHaveCount(4);
  await expect(teacher.getByRole("button", { name: "Print or save as PDF" })).toBeEnabled();

  expect(pageErrors).toEqual([]);
  await teacherContext.close();
  await studentContext.close();
});
