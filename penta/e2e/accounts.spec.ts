import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { assertLocalSupabase } from "../src/lib/supabase/local";

if (existsSync(".env.local")) process.loadEnvFile(".env.local");

const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const joinCodeText = /[A-HJ-NP-Z2-9]{5}-[A-HJ-NP-Z2-9]{5}/;
const password = `pw-${randomUUID()}`;
const createdEmails: string[] = [];

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

async function createTeacher() {
  const email = testEmail("e2e-teacher");
  const { error } = await adminClient().auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: "Tess Teacher" },
    app_metadata: { role: "teacher" },
  });
  if (error) throw error;
  return email;
}

async function logIn(page: Page, email: string) {
  await page.getByLabel("School email").fill(email);
  await page.getByLabel(/^Password/).fill(password);
  await page.getByRole("button", { name: "Log in" }).click();
}

test.afterAll(async () => {
  const admin = adminClient();
  const { data } = await admin.auth.admin.listUsers({ perPage: 1000 });
  const mine = (data?.users ?? []).filter((user) => createdEmails.includes(user.email ?? ""));
  for (const user of mine) await admin.from("classes").delete().eq("teacher_id", user.id);
  for (const user of mine) await admin.auth.admin.deleteUser(user.id);
});

test("a student signs up, joins a class, shows in the roster and logs out", async ({ browser }) => {
  const teacherEmail = await createTeacher();
  const studentEmail = testEmail("e2e-student");
  const studentName = `Sam Student ${randomUUID().slice(0, 6)}`;
  const classTitle = `End to end ${randomUUID().slice(0, 6)}`;

  const teacherContext = await browser.newContext();
  const teacher = await teacherContext.newPage();
  await teacher.goto("/classes");
  await expect(teacher).toHaveURL(/\/login\?next=%2Fclasses$/);
  await logIn(teacher, teacherEmail);
  await expect(teacher).toHaveURL(/\/classes$/);
  await teacher.getByLabel(/Course code/).fill("E2E 101");
  await teacher.getByLabel(/^Title/).fill(classTitle);
  await teacher.getByRole("button", { name: "Create class" }).click();
  await expect(teacher).toHaveURL(/\/classes\/[0-9a-f-]{36}/);
  await expect(teacher.getByRole("heading", { level: 1 })).toHaveText(classTitle);
  const joinCode = (await teacher.getByRole("region", { name: "Join code" }).innerText()).match(joinCodeText)?.[0];
  expect(joinCode).toBeTruthy();
  await expect(teacher.getByText("No students yet. Share the join code.")).toBeVisible();

  const studentContext = await browser.newContext();
  const student = await studentContext.newPage();
  await student.goto("/signup");
  await student.getByLabel("Full name").fill(studentName);
  await student.getByLabel("School email").fill(studentEmail);
  await student.getByLabel(/^Password/).fill(password);
  await student.getByRole("button", { name: "Sign up" }).click();
  await expect(student).toHaveURL(/\/hub$/);
  await expect(student.getByRole("heading", { level: 1 })).toContainText("0 m");
  await expect(student.getByText("No classes yet")).toBeVisible();

  await student.goto("/classes");
  await student.getByLabel("Join code").fill(joinCode!.toLowerCase());
  await student.getByRole("button", { name: "Join class" }).click();
  await expect(student).toHaveURL(/\/classes\/[0-9a-f-]{36}/);
  await expect(student.getByRole("heading", { level: 1 })).toHaveText(classTitle);
  await expect(student.getByText("Tess Teacher")).toBeVisible();
  await expect(student.getByText(joinCodeText)).toHaveCount(0);

  await student.goto("/hub");
  await expect(student.getByRole("link", { name: new RegExp(classTitle) })).toBeVisible();

  await teacher.reload();
  await expect(teacher.getByRole("table")).toContainText(studentName);

  await student.reload();
  await expect(student).toHaveURL(/\/hub$/);
  await student.getByRole("button", { name: "Sign out" }).click();
  await expect(student).toHaveURL(/\/login$/);
  await student.goto("/classes");
  await expect(student).toHaveURL(/\/login\?next=%2Fclasses$/);

  await teacherContext.close();
  await studentContext.close();
});

test("a wrong password and an unsafe next value are handled", async ({ page }) => {
  const teacherEmail = await createTeacher();

  await page.goto("/login?next=//evil.example");
  await page.getByLabel("School email").fill(teacherEmail);
  await page.getByLabel(/^Password/).fill("not-the-password");
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Email or password is incorrect" })).toBeVisible();

  await logIn(page, teacherEmail);
  await expect(page).toHaveURL(/\/hub$/);
  await expect(page.getByRole("link", { name: /Create a class/ })).toBeVisible();

  await page.goto("/login");
  await expect(page).toHaveURL(/\/hub$/);
});

test("a wrong teacher code creates no account", async ({ page }) => {
  const email = testEmail("e2e-not-teacher");

  await page.goto("/signup");
  await page.getByLabel("Full name").fill("Not A Teacher");
  await page.getByLabel("School email").fill(email);
  await page.getByLabel(/^Password/).fill(password);
  await page.getByLabel("Teacher code").fill("a-guess-that-is-wrong");
  await page.getByRole("button", { name: "Sign up" }).click();
  await expect(page.getByText("That teacher code is not valid")).toBeVisible();
  await expect(page).toHaveURL(/\/signup/);

  const { data } = await adminClient().auth.admin.listUsers({ perPage: 1000 });
  expect((data?.users ?? []).some((user) => user.email === email)).toBe(false);
});

for (const path of ["/login", "/signup"]) {
  for (const theme of ["light", "dark"]) {
    test(`axe finds no serious or critical violations on ${path} in ${theme}`, async ({ context, page, baseURL }) => {
      await context.addCookies([{ name: "penta-theme", value: theme, url: baseURL }]);
      await page.goto(path);
      await page.evaluate(() => document.fonts.ready);
      const results = await new AxeBuilder({ page }).analyze();
      const blocking = results.violations.filter((violation) =>
        ["serious", "critical"].includes(violation.impact ?? ""),
      );
      expect(blocking, JSON.stringify(blocking, null, 2)).toEqual([]);
    });
  }
}
