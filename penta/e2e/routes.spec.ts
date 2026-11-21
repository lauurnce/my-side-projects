import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { assertLocalSupabase } from "../src/lib/supabase/local";

if (existsSync(".env.local")) process.loadEnvFile(".env.local");

const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const password = `pw-${randomUUID()}`;
const createdEmails: string[] = [];
const joinCodeText = /[A-HJ-NP-Z2-9]{5}-[A-HJ-NP-Z2-9]{5}/;
const lessonBody = [
  "# Why brokers",
  "",
  "A broker sits between a **producer** and a consumer.",
  "",
  "<script>window.lessonScriptRan = true</script>",
  "",
  "![tracker](https://example.com/pixel.gif)",
  "",
  "[bad link](javascript:alert(1)) and [good link](https://example.com/docs)",
].join("\n");

test.skip(!serviceRoleKey, "needs the local development database");

function adminClient() {
  const url = assertLocalSupabase(process.env.NEXT_PUBLIC_SUPABASE_URL);
  return createClient(url, serviceRoleKey!, { auth: { persistSession: false, autoRefreshToken: false } });
}

function testEmail(name: string) {
  const email = `${name}-${randomUUID().slice(0, 8)}@penta.test`;
  createdEmails.push(email);
  return email;
}

async function logIn(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("School email").fill(email);
  await page.getByLabel(/^Password/).fill(password);
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page).toHaveURL(/\/hub$/);
}

test.afterAll(async () => {
  const admin = adminClient();
  const { data } = await admin.auth.admin.listUsers({ perPage: 1000 });
  const mine = (data?.users ?? []).filter((user) => createdEmails.includes(user.email ?? ""));
  const ids = mine.map((user) => user.id);
  if (ids.length === 0) return;

  await admin.from("lesson_progress").delete().in("student_id", ids);
  const { data: classes } = await admin.from("classes").select("id").in("teacher_id", ids);
  const classIds = (classes ?? []).map((row) => row.id);
  const { data: modules } = classIds.length
    ? await admin.from("modules").select("id").in("class_id", classIds)
    : { data: [] };
  const moduleIds = (modules ?? []).map((row) => row.id);
  if (moduleIds.length) await admin.from("lessons").delete().in("module_id", moduleIds);
  if (classIds.length) await admin.from("modules").delete().in("class_id", classIds);
  if (classIds.length) await admin.from("classes").delete().in("id", classIds);
  for (const id of ids) await admin.auth.admin.deleteUser(id);
});

test("a teacher builds a module with two lessons and a student reads the published one", async ({ browser }) => {
  const admin = adminClient();
  const teacherEmail = testEmail("routes-teacher");
  const studentEmail = testEmail("routes-student");
  const classTitle = `Routes ${randomUUID().slice(0, 6)}`;
  for (const [email, role, name] of [
    [teacherEmail, "teacher", "Tess Teacher"],
    [studentEmail, "student", "Sam Student"],
  ]) {
    const { error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: name },
      app_metadata: role === "teacher" ? { role } : {},
    });
    if (error) throw error;
  }

  const teacherContext = await browser.newContext();
  const teacher = await teacherContext.newPage();
  const dialogs: string[] = [];
  await logIn(teacher, teacherEmail);
  await teacher.goto("/classes");
  await teacher.getByLabel(/Course code/).fill("RT 101");
  await teacher.getByLabel(/^Title/).fill(classTitle);
  await teacher.getByRole("button", { name: "Create class" }).click();
  await expect(teacher).toHaveURL(/\/classes\/[0-9a-f-]{36}$/);
  const classUrl = teacher.url();
  const joinCode = (await teacher.getByRole("region", { name: "Join code" }).innerText()).match(joinCodeText)![0];
  await expect(teacher.getByText("No modules yet. Add the first module.")).toBeVisible();

  await teacher.getByLabel("New module title").fill("Week 1");
  await teacher.getByRole("button", { name: "Add module" }).click();
  await expect(teacher.getByText("No lessons in this module yet.")).toBeVisible();

  await teacher.getByLabel("New lesson title").fill("Message brokers");
  await teacher.getByRole("button", { name: /Add lesson/ }).click();
  await expect(teacher).toHaveURL(/\/lessons\/[0-9a-f-]{36}\/edit$/);
  await teacher.getByLabel("Body").fill(lessonBody);
  const preview = teacher.getByRole("region", { name: "Preview" });
  await expect(preview.getByRole("heading", { name: "Why brokers" })).toBeVisible();
  await expect(preview.locator("img, script")).toHaveCount(0);
  await teacher.getByRole("button", { name: "Save", exact: true }).click();
  await expect(teacher.getByRole("status").filter({ hasText: "Saved" })).toBeVisible();
  await teacher.getByRole("button", { name: /^Publish/ }).click();
  await expect(teacher.getByRole("button", { name: /^Unpublish/ })).toBeVisible();

  await teacher.goto(classUrl);
  await teacher.getByLabel("New lesson title").fill("Queues in practice");
  await teacher.getByRole("button", { name: /Add lesson/ }).click();
  await expect(teacher).toHaveURL(/\/lessons\/[0-9a-f-]{36}\/edit$/);
  await teacher.goto(classUrl);
  const lessonList = teacher.getByRole("list", { name: "Lessons in Week 1" });
  await expect(lessonList.getByRole("listitem")).toHaveCount(2);
  await expect(lessonList.getByRole("listitem").nth(0)).toContainText("Published");
  await expect(lessonList.getByRole("listitem").nth(1)).toContainText("Draft");

  const studentContext = await browser.newContext();
  const student = await studentContext.newPage();
  student.on("dialog", (dialog) => {
    dialogs.push(dialog.message());
    void dialog.dismiss();
  });
  await logIn(student, studentEmail);
  await student.goto("/classes");
  await student.getByLabel("Join code").fill(joinCode);
  await student.getByRole("button", { name: "Join class" }).click();
  await expect(student).toHaveURL(/\/classes\/[0-9a-f-]{36}/);
  await expect(student.getByText("0 of 1 lesson done")).toBeVisible();
  await expect(student.getByText("Queues in practice")).toHaveCount(0);

  await student.getByRole("link", { name: /Message brokers/ }).first().click();
  await expect(student).toHaveURL(/\/lessons\/[0-9a-f-]{36}$/);
  await expect(student.getByRole("heading", { level: 1 })).toHaveText("Message brokers");
  await expect(student.getByRole("heading", { level: 2, name: "Why brokers" })).toBeVisible();
  await expect(student.getByText("<script>window.lessonScriptRan = true</script>")).toBeVisible();
  expect(await student.evaluate(() => (window as { lessonScriptRan?: boolean }).lessonScriptRan)).toBeUndefined();
  await expect(student.locator("main img")).toHaveCount(0);
  await expect(student.getByRole("link", { name: /bad link/ })).toHaveCount(0);
  await expect(student.getByRole("link", { name: /good link/ })).toHaveAttribute("href", "https://example.com/docs");
  expect(await student.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);

  const scan = await new AxeBuilder({ page: student }).analyze();
  const blocking = scan.violations.filter((violation) => ["serious", "critical"].includes(violation.impact ?? ""));
  expect(blocking, JSON.stringify(blocking, null, 2)).toEqual([]);

  await student.getByRole("button", { name: "Mark as done" }).click();
  await expect(student.getByRole("button", { name: "Mark as not done" })).toBeVisible();

  await student.goto(classUrl);
  await expect(student.getByText("1 of 1 lesson done")).toBeVisible();
  await expect(student.getByText("All lessons done.")).toBeVisible();

  await student.goto("/hub");
  await expect(student.getByRole("heading", { level: 1 })).toContainText("3,000 m");
  await expect(student.getByRole("link", { name: new RegExp(classTitle) })).toContainText("Lesson 1 of 1");

  const draftUrl = `${classUrl}/lessons/${teacher.url().split("/lessons/")[1] ?? randomUUID()}`;
  const draftResponse = await student.goto(draftUrl.replace(/\/edit$/, ""));
  expect(draftResponse?.status()).toBe(404);
  expect(dialogs).toEqual([]);

  await teacherContext.close();
  await studentContext.close();
});
