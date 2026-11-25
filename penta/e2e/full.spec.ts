import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { assertLocalSupabase } from "../src/lib/supabase/local";
import { buildPdf } from "../tests/fixtures/deck-files";

if (existsSync(".env.local")) process.loadEnvFile(".env.local");

type Theme = "light" | "dark";

const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const password = `pw-${randomUUID()}`;
const createdEmails: string[] = [];
const joinCodeText = /[A-HJ-NP-Z2-9]{5}-[A-HJ-NP-Z2-9]{5}/;
const slideCount = 3;
const moduleTitle = "Week 1";
const lessonTitle = "Message brokers";
const lessonBody = ["# Why brokers", "", "A broker sits between a **producer** and a consumer."].join("\n");
const feedback = "Clear structure. Cite the access matrix next time.";

test.skip(!serviceRoleKey, "needs the local development database");
test.setTimeout(300000);

function adminClient() {
  const url = assertLocalSupabase(process.env.NEXT_PUBLIC_SUPABASE_URL);
  return createClient(url, serviceRoleKey!, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function createUser(name: string, role: "teacher" | "student") {
  const email = `full-${role}-${randomUUID().slice(0, 8)}@penta.test`;
  createdEmails.push(email);
  const { error } = await adminClient().auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: name },
    app_metadata: role === "teacher" ? { role } : {},
  });
  if (error) throw error;
  return { email, name };
}

async function setTheme(context: BrowserContext, baseURL: string, theme: Theme) {
  await context.addCookies([{ name: "penta-theme", value: theme, url: baseURL }]);
}

async function themedContext(browser: Browser, baseURL: string, theme: Theme) {
  const context = await browser.newContext();
  await setTheme(context, baseURL, theme);
  return context;
}

async function logIn(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("School email").fill(email);
  await page.getByLabel(/^Password/).fill(password);
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page).toHaveURL(/\/hub$/);
}

async function expectTheme(page: Page, theme: Theme) {
  expect(await page.evaluate(() => document.documentElement.dataset.theme)).toBe(theme);
}

async function expectNoViolations(page: Page) {
  const scan = await new AxeBuilder({ page }).analyze();
  const found = scan.violations.map((violation) => ({
    id: violation.id,
    impact: violation.impact,
    targets: violation.nodes.map((node) => node.target.join(" ")),
  }));
  expect(found, `${page.url()} ${JSON.stringify(found, null, 2)}`).toEqual([]);
}

function counter(page: Page, slide: number) {
  return page.getByText(`Slide ${slide} / ${slideCount}`, { exact: true });
}

function viewed(page: Page, slides: number) {
  return page.getByText(`Viewed ${slides} / ${slideCount}`, { exact: true });
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

async function hubMeters(page: Page) {
  await page.goto("/hub");
  const headline = await page.getByRole("heading", { level: 1 }).innerText();
  const meters = headline.match(/([\d,]+)\s*m\b/i);
  expect(meters, headline).not.toBeNull();
  return Number(meters![1].replace(/,/g, ""));
}

async function focusWithKeyboard(page: Page, target: ReturnType<Page["locator"]>, tabKey: string) {
  await target.focus();
  await page.keyboard.press(`Shift+${tabKey}`);
  await page.keyboard.press(tabKey);
  await expect(target).toBeFocused();
}

async function deleteClassData(admin: ReturnType<typeof adminClient>, classIds: string[]) {
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
  const { data: activities } = await admin.from("activities").select("id").in("class_id", classIds);
  const activityIds = (activities ?? []).map((row) => row.id);
  if (activityIds.length) {
    const { data: submissions } = await admin.from("submissions").select("file_path").in("activity_id", activityIds);
    const paths = (submissions ?? []).map((row) => row.file_path).filter((path): path is string => path !== null);
    if (paths.length) await admin.storage.from("submissions").remove(paths);
    await admin.from("submissions").delete().in("activity_id", activityIds);
    await admin.from("submission_uploads").delete().in("activity_id", activityIds);
    await admin.from("quiz_attempts").delete().in("activity_id", activityIds);
    await admin.from("activities").delete().in("id", activityIds);
  }
  await admin.from("decks").delete().in("class_id", classIds);
  const { data: orphans } = await admin.rpc("sweep_decks");
  const mine = ((orphans ?? []) as string[]).filter((name) => classIds.some((id) => name.startsWith(`${id}/`)));
  if (mine.length) await admin.storage.from("decks").remove(mine);
  const { data: modules } = await admin.from("modules").select("id").in("class_id", classIds);
  const moduleIds = (modules ?? []).map((row) => row.id);
  if (moduleIds.length) await admin.from("lessons").delete().in("module_id", moduleIds);
  await admin.from("modules").delete().in("class_id", classIds);
  await admin.from("classes").delete().in("id", classIds);
}

test.afterAll(async () => {
  const admin = adminClient();
  const { data } = await admin.auth.admin.listUsers({ perPage: 1000 });
  const ids = (data?.users ?? []).filter((user) => createdEmails.includes(user.email ?? "")).map((user) => user.id);
  if (ids.length === 0) return;

  await admin.from("lesson_progress").delete().in("student_id", ids);
  const { data: classes } = await admin.from("classes").select("id").in("teacher_id", ids);
  const classIds = (classes ?? []).map((row) => row.id);
  if (classIds.length) await deleteClassData(admin, classIds);
  for (const id of ids) await admin.auth.admin.deleteUser(id);
});

for (const theme of ["light", "dark"] as const) {
  test(`a teacher and a student go through a whole class in the ${theme} theme`, async ({ browser, baseURL }, testInfo) => {
    const teacherUser = await createUser("Tess Teacher", "teacher");
    const studentUser = await createUser("Sam Student", "student");
    const tag = randomUUID().slice(0, 6);
    const classTitle = `Full journey ${tag}`;
    const deckTitle = `Broker slides ${tag}`;
    const quizTitle = `Brokers check ${tag}`;
    const uploadTitle = `Access essay ${tag}`;
    const questionTitle = `Why a broker ${tag}`;
    const teacherAnswer = `It lets both sides work at their own pace ${tag}.`;
    const unsentAnswer = `Thanks, that clears it up ${tag}.`;
    const lostReply = `One more note about queues ${tag}.`;
    const tabKey = testInfo.project.name === "webkit" ? "Alt+Tab" : "Tab";
    const pageErrors: string[] = [];
    const watch = (name: string, page: Page) => page.on("pageerror", (error) => pageErrors.push(`${name}: ${error.message}`));

    const teacherContext = await themedContext(browser, baseURL!, theme);
    const studentContext = await themedContext(browser, baseURL!, theme);
    const teacher = await teacherContext.newPage();
    const student = await studentContext.newPage();
    watch("teacher", teacher);
    watch("student", student);

    await logIn(teacher, teacherUser.email);
    await expectTheme(teacher, theme);
    await teacher.goto("/classes");
    await teacher.getByLabel(/Course code/).fill("FJ 101");
    await teacher.getByLabel(/^Title/).fill(classTitle);
    await teacher.getByRole("button", { name: "Create class" }).click();
    await expect(teacher).toHaveURL(/\/classes\/[0-9a-f-]{36}$/);
    const classUrl = teacher.url();
    const classPath = new URL(classUrl).pathname;
    const joinCode = (await teacher.getByRole("region", { name: "Join code" }).innerText()).match(joinCodeText)![0];

    await teacher.getByLabel("New module title").fill(moduleTitle);
    await teacher.getByRole("button", { name: "Add module" }).click();
    await expect(teacher.getByText("No lessons in this module yet.")).toBeVisible();
    await teacher.getByLabel("New lesson title").fill(lessonTitle);
    await teacher.getByRole("button", { name: /Add lesson/ }).click();
    await expect(teacher).toHaveURL(/\/lessons\/[0-9a-f-]{36}\/edit$/);
    const lessonPath = new URL(teacher.url()).pathname.replace(/\/edit$/, "");
    await teacher.getByLabel("Body").fill(lessonBody);
    await expect(teacher.getByRole("region", { name: "Preview" }).getByRole("heading", { name: "Why brokers" })).toBeVisible();
    await teacher.getByRole("button", { name: "Save", exact: true }).click();
    await expect(teacher.getByRole("status").filter({ hasText: "Saved" })).toBeVisible();
    await teacher.getByRole("button", { name: /^Publish/ }).click();
    await expect(teacher.getByRole("button", { name: /^Unpublish/ })).toBeVisible();

    await teacher.goto(classUrl);
    const lessonList = teacher.getByRole("list", { name: `Lessons in ${moduleTitle}` });
    await expect(lessonList.getByRole("listitem")).toHaveCount(1);
    await expect(lessonList.getByRole("listitem")).toContainText("Published");
    await expect(teacher.getByRole("button", { name: `Move down: ${moduleTitle}`, exact: true })).toBeVisible();
    await expectTheme(teacher, theme);
    await expectNoViolations(teacher);

    const upload = teacher.getByRole("form", { name: "Upload a deck" });
    await upload.getByLabel("Deck title").fill(deckTitle);
    await upload.locator('input[name="pdf"]').setInputFiles({
      name: "broker-slides.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from(buildPdf(slideCount, 20000)),
    });
    await upload.getByRole("button", { name: "Upload deck" }).click();
    await expect(upload.getByRole("status").filter({ hasText: "Deck uploaded" })).toBeVisible({ timeout: 30000 });
    const deckRow = teacher.getByRole("list", { name: "Decks in this class" }).getByRole("listitem");
    await expect(deckRow).toHaveCount(1);
    await expect(deckRow).toContainText(`${slideCount} slides`);

    await teacher.getByLabel("Quiz title").fill(quizTitle);
    await teacher.getByRole("button", { name: "New quiz" }).click();
    await expect(teacher).toHaveURL(/\/ops\/[0-9a-f-]{36}$/);
    await saveQuestion(teacher, "Multiple choice", "Which part sits between a producer and a consumer?", async () => {
      await teacher.getByLabel("Option 1", { exact: true }).fill("Database");
      await teacher.getByLabel("Option 2", { exact: true }).fill("Broker");
      await teacher.getByLabel("Option 3", { exact: true }).fill("Cache");
      await teacher.getByRole("radio", { name: "Correct option 2" }).check();
    });
    await saveQuestion(teacher, "True or false", "A queue delivers each message to every consumer.", async () => {
      await teacher.getByRole("group", { name: "Right answer" }).getByRole("radio", { name: "False" }).check();
    });
    await expectNoViolations(teacher);
    await teacher.getByRole("button", { name: "Publish quiz" }).click();
    await expect(teacher.getByRole("button", { name: "Unpublish" })).toBeVisible();

    await teacher.goto(classUrl);
    await teacher.getByLabel("Activity title").fill(uploadTitle);
    await teacher.getByLabel("Points").fill("20");
    await teacher.getByRole("button", { name: "New upload activity" }).click();
    await expect(teacher).toHaveURL(/\/ops\/[0-9a-f-]{36}$/);
    const uploadUrl = teacher.url();
    await teacher.getByRole("button", { name: "Publish activity" }).click();
    await expect(teacher.getByRole("button", { name: "Unpublish" })).toBeVisible();

    await logIn(student, studentUser.email);
    await expectTheme(student, theme);
    await student.goto("/classes");
    await student.getByLabel("Join code").fill(joinCode);
    await student.getByRole("button", { name: "Join class" }).click();
    await expect(student).toHaveURL(new RegExp(`${classPath}(\\?joined=1)?$`));
    await expect(student.getByText("0 of 1 lesson done")).toBeVisible();
    await expectTheme(student, theme);
    await expectNoViolations(student);

    await student.getByRole("link", { name: new RegExp(lessonTitle) }).first().click();
    await expect(student).toHaveURL(new RegExp(`${lessonPath}$`));
    await expect(student.getByRole("heading", { level: 1 })).toHaveText(lessonTitle);
    await expect(student.getByRole("heading", { level: 2, name: "Why brokers" })).toBeVisible();
    await student.getByRole("button", { name: "Mark as done" }).click();
    await expect(student.getByRole("button", { name: "Mark as not done" })).toBeVisible();
    await student.goto(classUrl);
    await expect(student.getByText("1 of 1 lesson done")).toBeVisible();

    await student.getByRole("link", { name: new RegExp(deckTitle) }).click();
    await expect(student).toHaveURL(/\/decks\/[0-9a-f-]{36}$/);
    const deckPath = new URL(student.url()).pathname;
    await expect(student.getByRole("heading", { level: 1 })).toHaveText(deckTitle);
    await expect(student.locator('canvas[data-painted="true"]')).toBeVisible({ timeout: 30000 });
    await expect(counter(student, 1)).toBeVisible();
    await expect(viewed(student, 1)).toBeVisible({ timeout: 15000 });
    await student.getByRole("button", { name: "Next slide" }).click();
    await expect(counter(student, 2)).toBeVisible();
    await expect(viewed(student, 2)).toBeVisible({ timeout: 15000 });
    await student.getByRole("button", { name: "Next slide" }).click();
    await expect(counter(student, 3)).toBeVisible();
    await expect(viewed(student, 3)).toBeVisible({ timeout: 15000 });
    await expectTheme(student, theme);

    await teacher.goto(deckPath);
    await expect(teacher.locator('canvas[data-painted="true"]')).toBeVisible({ timeout: 30000 });
    await teacher.getByRole("button", { name: "Present" }).click();
    await expect(teacher.getByRole("button", { name: "End session" })).toBeVisible();
    await expect(student.getByRole("button", { name: "Join live" })).toBeVisible({ timeout: 40000 });
    await student.getByRole("button", { name: "Join live" }).click();
    await expect(counter(student, 1)).toBeVisible({ timeout: 10000 });
    await expect(student.getByRole("button", { name: "Browse freely" })).toBeVisible();
    await teacher.waitForTimeout(600);
    await teacher.getByRole("button", { name: "Next slide" }).click();
    await expect(counter(teacher, 2)).toBeVisible();
    await expect(counter(student, 2)).toBeVisible({ timeout: 10000 });
    await teacher.getByRole("button", { name: "End session" }).click();
    await expect(teacher.getByRole("button", { name: "Present" })).toBeVisible();
    await expect(student.getByRole("button", { name: "Browse freely" })).toHaveCount(0, { timeout: 20000 });

    await student.goto(classUrl);
    await student.getByRole("link", { name: new RegExp(quizTitle) }).click();
    await expect(student).toHaveURL(/\/ops\/[0-9a-f-]{36}$/);
    await student.getByRole("button", { name: "Start quiz" }).click();
    await expect(student).toHaveURL(/\/attempt\/[0-9a-f-]{36}$/);
    await student.getByRole("group", { name: /^Question 1/ }).getByRole("radio", { name: "Broker" }).check();
    await student.getByRole("group", { name: /^Question 2/ }).getByRole("radio", { name: "True" }).check();
    await student.getByRole("button", { name: "Submit quiz" }).click();
    await expect(student.getByText("You scored 1 of 2")).toBeVisible();
    await expectTheme(student, theme);

    await student.goto(classUrl);
    await expect(student.getByRole("link", { name: new RegExp(quizTitle) })).toContainText("Graded · 1 of 2");
    await student.getByRole("link", { name: new RegExp(uploadTitle) }).click();
    await expect(student).toHaveURL(new RegExp(`${new URL(uploadUrl).pathname}$`));
    const handIn = student.getByRole("form", { name: "Hand in a file" });
    await handIn.locator('input[type="file"]').setInputFiles({
      name: "essay.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from(buildPdf(2, 4000)),
    });
    await handIn.getByRole("button", { name: "Hand in" }).click();
    await expect(student.getByRole("status").filter({ hasText: "Handed in" })).toBeVisible({ timeout: 30000 });
    await expect(student.getByText("Submitted", { exact: true })).toBeVisible();

    const metersBefore = await hubMeters(student);
    await expectTheme(student, theme);
    await expectNoViolations(student);
    const classCard = student.getByRole("link", { name: new RegExp(classTitle) });
    await expect(classCard).toHaveAttribute("href", classPath);
    await focusWithKeyboard(student, classCard, tabKey);
    const outline = await classCard.locator('[class*="card"]').first().evaluate((card) => {
      const style = getComputedStyle(card);
      return { outlineStyle: style.outlineStyle, outlineWidth: style.outlineWidth };
    });
    expect(outline).toEqual({ outlineStyle: "solid", outlineWidth: "2px" });

    await teacher.goto(uploadUrl);
    await expect(teacher.getByRole("link", { name: "Open file" })).toBeVisible();
    await teacher.getByLabel(`Score for ${studentUser.name}`).fill("18");
    await teacher.getByLabel(`Feedback for ${studentUser.name}`).fill(feedback);
    await teacher.getByRole("button", { name: "Save grade" }).click();
    await expect(teacher.getByRole("status").filter({ hasText: "Grade saved" })).toBeVisible();
    await expect(teacher.getByText(new RegExp(`Graded by ${teacherUser.name}`))).toBeVisible();

    await student.goto(uploadUrl);
    await expect(student.getByText("18 of 20").first()).toBeVisible();
    await expect(student.getByText(feedback)).toBeVisible();
    await student.goto("/grades");
    await expect(student.getByRole("heading", { level: 1 })).toHaveText("Grades");
    await expect(student.getByText("18 of 20").first()).toBeVisible();
    const metersAfter = await hubMeters(student);
    expect(metersAfter).toBeGreaterThan(metersBefore);
    expect(metersAfter).toBeLessThanOrEqual(3000);
    await expect(student.getByRole("link", { name: new RegExp(classTitle) })).toContainText("Lesson 1 of 1");

    const missingDeck = await student.goto(`/decks/${randomUUID()}`);
    expect(missingDeck?.status()).toBe(404);
    await expect(student.getByRole("heading", { name: "Not found" })).toBeVisible();
    await expect(student.getByRole("link", { name: "Back to the hub" })).toBeVisible();
    await expectTheme(student, theme);

    await student.goto(lessonPath);
    await expect(student.getByText("No questions yet. Ask the first one.")).toBeVisible();
    await student.getByRole("button", { name: "Ask a question" }).click();
    await student.getByLabel("Question title").fill(questionTitle);
    await student.getByLabel("Your question").fill("Why not let the producer call the consumer directly?");
    await student.getByRole("button", { name: "Post question" }).click();
    await expect(student).toHaveURL(/\/threads\/[0-9a-f-]{36}$/);
    const threadPath = new URL(student.url()).pathname;
    await expect(student.getByRole("heading", { level: 1 })).toHaveText(questionTitle);

    await teacher.goto(lessonPath);
    await teacher.getByRole("link", { name: questionTitle }).click();
    await expect(teacher).toHaveURL(new RegExp(`${threadPath}$`));
    await expectTheme(teacher, theme);
    await teacher.getByLabel("Your answer").fill(teacherAnswer);
    await teacher.getByRole("button", { name: "Post answer" }).click();
    await expect(teacher.getByText(teacherAnswer)).toBeVisible();
    await expect(student.getByText(teacherAnswer)).toBeVisible({ timeout: 15000 });
    await expect(student.getByText("Teacher", { exact: true }).first()).toBeVisible();

    await student.getByLabel("Your answer").fill(unsentAnswer);
    await studentContext.clearCookies();
    await student.getByRole("button", { name: "Post answer" }).click();
    await expect(student.getByRole("alert").filter({ hasText: /^Your session ended/ })).toBeVisible();
    await expect(student.getByLabel("Your answer")).toHaveValue(unsentAnswer);
    await setTheme(studentContext, baseURL!, theme);
    await logIn(student, studentUser.email);
    await expectTheme(student, theme);
    await student.goto(threadPath);
    await expect(student.getByText(teacherAnswer)).toBeVisible();
    await expect(student.getByText(unsentAnswer)).toHaveCount(0);

    const failing = await teacherContext.newPage();
    const isThreadPage = (url: URL) => url.pathname === threadPath;
    await failing.goto(threadPath);
    await expect(failing.getByText(teacherAnswer)).toBeVisible();
    await failing.getByLabel("Your answer").fill(lostReply);
    await failing.route(isThreadPage, (route) => (route.request().method() === "POST" ? route.abort() : route.continue()));
    await failing.getByRole("button", { name: "Post answer" }).click();
    await expect(failing.getByRole("heading", { name: "That did not work" })).toBeVisible();
    await expect(failing.getByRole("button", { name: "Try again" })).toBeVisible();
    await expect(failing.getByRole("link", { name: "Penta, hub" })).toBeVisible();
    await expect(failing.getByRole("link", { name: "Skip to the page" })).toHaveCount(1);
    await failing.unroute(isThreadPage);
    await failing.close();

    expect(pageErrors).toEqual([]);
    await teacherContext.close();
    await studentContext.close();
  });
}
