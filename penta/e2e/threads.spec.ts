import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { assertLocalSupabase } from "../src/lib/supabase/local";

if (existsSync(".env.local")) process.loadEnvFile(".env.local");

const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const password = `pw-${randomUUID()}`;
const createdEmails: string[] = [];
const liveLimitMilliseconds = 6000;

test.skip(!serviceRoleKey, "needs the local development database");
test.setTimeout(120000);

function localUrl() {
  return assertLocalSupabase(process.env.NEXT_PUBLIC_SUPABASE_URL);
}

function adminClient() {
  return createClient(localUrl(), serviceRoleKey!, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function createUser(name: string, role: "teacher" | "student") {
  const email = `thread-${role}-${randomUUID().slice(0, 8)}@penta.test`;
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

test.afterAll(async () => {
  const admin = adminClient();
  const { data } = await admin.auth.admin.listUsers({ perPage: 1000 });
  const ids = (data?.users ?? []).filter((user) => createdEmails.includes(user.email ?? "")).map((user) => user.id);
  if (ids.length === 0) return;

  const { data: classes } = await admin.from("classes").select("id").in("teacher_id", ids);
  const classIds = (classes ?? []).map((row) => row.id);
  if (classIds.length) {
    const { data: threads } = await admin.from("threads").select("id").in("class_id", classIds);
    const threadIds = (threads ?? []).map((row) => row.id);
    if (threadIds.length) {
      const { data: posts } = await admin.from("posts").select("id").in("thread_id", threadIds);
      const postIds = (posts ?? []).map((row) => row.id);
      if (postIds.length) await admin.from("post_events").delete().in("post_id", postIds);
      await admin.from("posts").delete().in("thread_id", threadIds).not("parent_id", "is", null);
      await admin.from("posts").delete().in("thread_id", threadIds);
      await admin.from("threads").delete().in("id", threadIds);
    }
    const { data: modules } = await admin.from("modules").select("id").in("class_id", classIds);
    const moduleIds = (modules ?? []).map((row) => row.id);
    if (moduleIds.length) await admin.from("lessons").delete().in("module_id", moduleIds);
    await admin.from("modules").delete().in("class_id", classIds);
    await admin.from("classes").delete().in("id", classIds);
  }
  for (const id of ids) await admin.auth.admin.deleteUser(id);
});

test("two students ask and reply live, and the teacher hides and locks", async ({ browser }, testInfo) => {
  const admin = adminClient();
  const teacherUser = await createUser("Thread Teacher", "teacher");
  const asker = await createUser("Alma Asker", "student");
  const helper = await createUser("Hugo Helper", "student");
  const outsiderUser = await createUser("Olive Outsider", "student");
  const title = `Why revoke usage ${randomUUID().slice(0, 6)}`;
  const question = "I do not see why **usage** matters here.\n\n<script>window.threadScriptRan = true</script>";
  const answer = `Because the role needs it to resolve names ${randomUUID().slice(0, 6)}.`;
  const replyText = `That makes sense now ${randomUUID().slice(0, 6)}.`;
  const teacherAnswer = `Schema usage comes before table privileges ${randomUUID().slice(0, 6)}.`;

  const { data: classRow, error: classError } = await admin
    .from("classes")
    .insert({ code: "TH 101", title: "Thread Systems", section: "BSIT 3-1", term: "1st sem", teacher_id: teacherUser.id })
    .select("id")
    .single();
  if (classError) throw classError;
  for (const student of [asker, helper]) {
    const { error } = await admin.from("enrollments").insert({ class_id: classRow.id, student_id: student.id });
    if (error) throw error;
  }
  const { data: moduleRow, error: moduleError } = await admin
    .from("modules")
    .insert({ class_id: classRow.id, title: "Week 1" })
    .select("id")
    .single();
  if (moduleError) throw moduleError;
  const { data: lessonRow, error: lessonError } = await admin
    .from("lessons")
    .insert({ module_id: moduleRow.id, title: "Roles and schemas", body_md: "A short lesson.", est_minutes: 5 })
    .select("id")
    .single();
  if (lessonError) throw lessonError;
  await admin.from("lessons").update({ published_at: new Date().toISOString() }).eq("id", lessonRow.id);
  const lessonUrl = `/classes/${classRow.id}/lessons/${lessonRow.id}`;

  const askerContext = await browser.newContext();
  const helperContext = await browser.newContext();
  const teacherContext = await browser.newContext();
  const first = await askerContext.newPage();
  const second = await helperContext.newPage();
  const teacher = await teacherContext.newPage();
  const pageErrors: string[] = [];
  for (const [name, page] of [["asker", first], ["helper", second], ["teacher", teacher]] as const) {
    page.on("pageerror", (error) => pageErrors.push(`${name}: ${error.message}`));
  }
  await logIn(first, asker.email);
  await logIn(second, helper.email);
  await logIn(teacher, teacherUser.email);

  await first.goto(lessonUrl);
  await expect(first.getByText("No questions yet. Ask the first one.")).toBeVisible();
  await first.getByRole("button", { name: "Ask a question" }).click();
  await first.getByLabel("Question title").fill(title);
  await first.getByLabel("Your question").fill(question);
  await first.getByRole("button", { name: "Post question" }).click();
  await expect(first).toHaveURL(/\/threads\/[0-9a-f-]{36}$/);
  const threadUrl = new URL(first.url()).pathname;
  const threadId = threadUrl.split("/threads/")[1];
  await expect(first.getByRole("heading", { level: 1 })).toHaveText(title);
  await expect(first.getByText("<script>window.threadScriptRan = true</script>")).toBeVisible();
  await expect(first.locator("main strong").filter({ hasText: "usage" })).toBeVisible();
  expect(await first.evaluate(() => (window as { threadScriptRan?: boolean }).threadScriptRan)).toBeUndefined();
  expect(await first.locator("main script:not([src]):text('threadScriptRan')").count()).toBe(0);

  await second.goto(lessonUrl);
  await second.getByRole("link", { name: title }).click();
  await expect(second).toHaveURL(new RegExp(`${threadUrl}$`));
  await expect(second.getByText(asker.name).first()).toBeVisible();
  await second.waitForTimeout(1500);
  await first.waitForTimeout(500);

  const timings: string[] = [];
  let started = Date.now();
  await second.getByLabel("Your answer").fill(answer);
  await second.getByRole("button", { name: "Post answer" }).click();
  await expect(second.getByText(answer)).toBeVisible();
  await expect(first.getByText(answer)).toBeVisible({ timeout: liveLimitMilliseconds });
  timings.push(`answer ${Date.now() - started} ms`);

  await first.getByRole("button", { name: "Reply" }).last().click();
  await first.getByLabel("Your reply").fill(replyText);
  started = Date.now();
  await first.getByRole("button", { name: "Post reply" }).click();
  await expect(first.getByText(replyText)).toBeVisible();
  await expect(second.getByText(replyText)).toBeVisible({ timeout: liveLimitMilliseconds });
  timings.push(`reply ${Date.now() - started} ms`);

  await teacher.goto(threadUrl);
  await expect(teacher.getByText(replyText)).toBeVisible();
  await teacher.getByLabel("Your answer").fill(teacherAnswer);
  started = Date.now();
  await teacher.getByRole("button", { name: "Post answer" }).click();
  await expect(first.getByText(teacherAnswer)).toBeVisible({ timeout: liveLimitMilliseconds });
  timings.push(`teacher answer ${Date.now() - started} ms`);
  await expect(first.getByText("Teacher", { exact: true }).first()).toBeVisible();
  console.log(`[${testInfo.project.name}] live update times: ${timings.join(", ")}`);
  testInfo.annotations.push({ type: "live update times", description: timings.join(", ") });

  await teacher.getByRole("button", { name: `Hide post by ${helper.name}` }).click();
  await expect(teacher.getByText("Hidden from students").first()).toBeVisible();
  await expect(first.getByText(answer)).toHaveCount(0, { timeout: liveLimitMilliseconds });
  await expect(first.getByText(replyText)).toHaveCount(0);
  await expect(second.getByText(answer)).toHaveCount(0, { timeout: liveLimitMilliseconds });
  await expect(teacher.getByText(answer)).toBeVisible();
  await expect(first.getByText(teacherAnswer)).toBeVisible();

  await teacher.getByRole("button", { name: `Unhide post by ${helper.name}` }).click();
  await expect(first.getByText(answer)).toBeVisible({ timeout: liveLimitMilliseconds });
  await expect(first.getByText(replyText)).toBeVisible();

  await teacher.getByRole("button", { name: "Lock thread" }).click();
  await expect(teacher.getByRole("button", { name: "Unlock thread" })).toBeVisible();
  await expect(first.getByText("This thread is locked.")).toBeVisible({ timeout: liveLimitMilliseconds });
  await expect(first.getByRole("button", { name: "Post answer" })).toHaveCount(0);
  await expect(first.getByRole("button", { name: "Reply" })).toHaveCount(0);

  const direct = createClient(localUrl(), process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  await direct.auth.signInWithPassword({ email: asker.email, password });
  const refused = await direct.rpc("add_post", { target_thread: threadId, target_parent: null as never, post_body: "late" });
  expect(refused.data).toEqual({ status: "locked" });
  const hideAttempt = await direct.rpc("set_thread_locked", { target_thread: threadId, lock: false });
  expect(hideAttempt.data).toEqual({ status: "not_found" });
  const tables = await direct.from("posts").select("id");
  expect(tables.error?.code).toBe("42501");

  await teacher.getByRole("button", { name: "Unlock thread" }).click();
  await expect(first.getByRole("button", { name: "Post answer" })).toBeVisible({ timeout: liveLimitMilliseconds });

  await teacher.getByRole("button", { name: `Hide post by ${asker.name}` }).first().click();
  await teacher.getByRole("button", { name: "Hide the thread" }).click();
  await expect(first.getByText("This question is no longer available.")).toBeVisible({ timeout: liveLimitMilliseconds });
  await expect(first.getByText(title)).toHaveCount(0);
  await expect(first.getByText(teacherAnswer)).toHaveCount(0);
  await expect(first.getByText("threadScriptRan")).toHaveCount(0);
  expect((await second.goto(threadUrl))?.status()).toBe(404);
  await second.goto(lessonUrl);
  await expect(second.getByRole("link", { name: title })).toHaveCount(0);
  await teacher.goto(lessonUrl);
  await expect(teacher.getByRole("link", { name: title })).toBeVisible();

  const outsiderContext = await browser.newContext();
  const outsider = await outsiderContext.newPage();
  await logIn(outsider, outsiderUser.email);
  expect((await outsider.goto(threadUrl))?.status()).toBe(404);

  expect(await first.evaluate(() => (window as { threadScriptRan?: boolean }).threadScriptRan)).toBeUndefined();
  expect(pageErrors).toEqual([]);

  for (const context of [askerContext, helperContext, teacherContext, outsiderContext]) await context.close();
});
