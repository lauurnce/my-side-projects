import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { assertLocalSupabase } from "../src/lib/supabase/local";
import { buildPdf } from "../tests/fixtures/deck-files";

if (existsSync(".env.local")) process.loadEnvFile(".env.local");

const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const password = `pw-${randomUUID()}`;
const createdEmails: string[] = [];
const joinCodeText = /[A-HJ-NP-Z2-9]{5}-[A-HJ-NP-Z2-9]{5}/;
const storagePath = "**/storage/v1/object/sign/decks/**";

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

async function paintedPixels(page: Page): Promise<number> {
  return page.evaluate(() => {
    const canvas = document.querySelector("canvas");
    const context = canvas?.getContext("2d");
    if (!canvas || !context || canvas.width === 0) return 0;
    const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
    let dark = 0;
    for (let index = 0; index < data.length; index += 4) {
      if (data[index + 3] > 0 && data[index] + data[index + 1] + data[index + 2] < 300) dark += 1;
    }
    return dark;
  });
}

test.afterAll(async () => {
  const admin = adminClient();
  const { data } = await admin.auth.admin.listUsers({ perPage: 1000 });
  const ids = (data?.users ?? []).filter((user) => createdEmails.includes(user.email ?? "")).map((user) => user.id);
  if (ids.length === 0) return;

  const { data: classes } = await admin.from("classes").select("id").in("teacher_id", ids);
  const classIds = (classes ?? []).map((row) => row.id);
  if (classIds.length) await admin.from("decks").delete().in("class_id", classIds);
  const { data: orphans } = await admin.rpc("sweep_decks");
  const mine = ((orphans ?? []) as string[]).filter((name) => classIds.some((id) => name.startsWith(`${id}/`)));
  if (mine.length) await admin.storage.from("decks").remove(mine);
  if (classIds.length) await admin.from("classes").delete().in("id", classIds);
  for (const id of ids) await admin.auth.admin.deleteUser(id);
});

test("a teacher uploads a five page deck and a student flips through it", async ({ browser }) => {
  const admin = adminClient();
  const teacherEmail = testEmail("decks-teacher");
  const studentEmail = testEmail("decks-student");
  const outsiderEmail = testEmail("decks-outsider");
  const classTitle = `Decks ${randomUUID().slice(0, 6)}`;
  const deckTitle = "Week 3: Message brokers";
  for (const [email, role, name] of [
    [teacherEmail, "teacher", "Tess Teacher"],
    [studentEmail, "student", "Sam Student"],
    [outsiderEmail, "student", "Olive Outsider"],
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
  await logIn(teacher, teacherEmail);
  await teacher.goto("/classes");
  await teacher.getByLabel(/Course code/).fill("DK 101");
  await teacher.getByLabel(/^Title/).fill(classTitle);
  await teacher.getByRole("button", { name: "Create class" }).click();
  await expect(teacher).toHaveURL(/\/classes\/[0-9a-f-]{36}$/);
  const joinCode = (await teacher.getByRole("region", { name: "Join code" }).innerText()).match(joinCodeText)![0];
  await expect(teacher.getByText("No decks yet. Upload the first one.")).toBeVisible();
  await expect(teacher.getByText(/of 700 MB used/)).toBeVisible();

  const upload = teacher.getByRole("form", { name: "Upload a deck" });
  await upload.getByLabel("Deck title").fill(deckTitle);
  await upload.locator('input[name="pdf"]').setInputFiles({
    name: "notes.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("These are lecture notes saved as text, then renamed."),
  });
  await upload.getByRole("button", { name: "Upload deck" }).click();
  await expect(upload.getByText("This PDF could not be opened. Export it again and retry.")).toBeVisible();
  await expect(teacher.getByText("No decks yet. Upload the first one.")).toBeVisible();

  await upload.locator('input[name="pdf"]').setInputFiles({
    name: "../../week-3 <b>brokers</b>.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from(buildPdf(5, 600000)),
  });
  await upload.getByRole("button", { name: "Upload deck" }).click();
  await expect(upload.getByRole("status").filter({ hasText: "Deck uploaded" })).toBeVisible({ timeout: 30000 });
  const deckRow = teacher.getByRole("list", { name: "Decks in this class" }).getByRole("listitem");
  await expect(deckRow).toHaveCount(1);
  await expect(deckRow).toContainText("5 slides");
  await expect(deckRow).toContainText("PDF");

  const { data: decks } = await admin.from("decks").select("id, class_id, pdf_path, slide_count, ready_at, size_bytes");
  const deck = decks!.find((row) => teacher.url().includes(row.class_id))!;
  expect(deck.slide_count).toBe(5);
  expect(deck.ready_at).not.toBeNull();
  expect(deck.pdf_path).toBe(`${deck.class_id}/${deck.id}/slides.pdf`);
  expect(deck.size_bytes).toBe(buildPdf(5, 600000).length);

  const studentContext = await browser.newContext();
  const student = await studentContext.newPage();
  const pageErrors: string[] = [];
  const rangeStatuses: number[] = [];
  let workers = 0;
  student.on("pageerror", (error) => pageErrors.push(error.message));
  student.on("worker", () => {
    workers += 1;
  });
  student.on("response", (response) => {
    if (response.url().includes("/storage/v1/object/sign/decks/")) rangeStatuses.push(response.status());
  });
  await logIn(student, studentEmail);
  await student.goto("/classes");
  await student.getByLabel("Join code").fill(joinCode);
  await student.getByRole("button", { name: "Join class" }).click();
  await expect(student).toHaveURL(/\/classes\/[0-9a-f-]{36}/);

  const thumb = student.getByRole("link", { name: new RegExp(deckTitle) });
  await expect(thumb).toContainText("5 slides · PDF");
  await expect(thumb).toContainText("Viewed 0 / 5");
  await thumb.click();
  await expect(student).toHaveURL(new RegExp(`/decks/${deck.id}$`));
  await expect(student.getByRole("heading", { level: 1 })).toHaveText(deckTitle);
  await expect(student.getByText("Slide 1 / 5")).toBeVisible();
  await expect(student.locator('canvas[data-painted="true"]')).toBeVisible({ timeout: 30000 });
  expect(await paintedPixels(student)).toBeGreaterThan(100);
  expect(workers).toBeGreaterThan(0);
  expect(rangeStatuses.length).toBeGreaterThan(0);
  expect(rangeStatuses.every((status) => status === 206)).toBe(true);
  await expect(student.getByText("Viewed 1 / 5")).toBeVisible();

  await student.getByRole("button", { name: "Next slide" }).click();
  await student.getByRole("button", { name: "Next slide" }).click();
  await expect(student.getByText("Slide 3 / 5")).toBeVisible();
  await expect(student.getByText("Viewed 2 / 5")).toBeVisible();
  await expect(student.getByRole("button", { name: "Slide 3, viewed" })).toHaveAttribute("aria-current", "true");
  await expect(student.getByRole("button", { name: "Slide 2", exact: true })).toBeVisible();

  await expect
    .poll(async () => {
      const { data } = await admin.from("deck_views").select("slide_no").eq("deck_id", deck.id).order("slide_no");
      return (data ?? []).map((row) => row.slide_no);
    })
    .toEqual([1, 3]);

  await student.getByRole("group", { name: `Slides of ${deckTitle}` }).focus();
  for (let press = 0; press < 6; press += 1) await student.keyboard.press("ArrowRight");
  await expect(student.getByText("Slide 5 / 5")).toBeVisible();
  await expect(student.getByRole("button", { name: "Next slide" })).toBeDisabled();
  await expect(student.locator('canvas[data-painted="true"]')).toBeVisible();
  await student.keyboard.press("Home");
  await expect(student.getByText("Slide 1 / 5")).toBeVisible();
  expect(pageErrors).toEqual([]);
  expect(await student.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);

  const scan = await new AxeBuilder({ page: student }).analyze();
  const blocking = scan.violations.filter((violation) => ["serious", "critical"].includes(violation.impact ?? ""));
  expect(blocking, JSON.stringify(blocking, null, 2)).toEqual([]);

  const download = await student.request.get(`/decks/${deck.id}/download`, { maxRedirects: 0 });
  expect(download.status()).toBe(302);
  expect(download.headers()["cache-control"]).toBe("no-store");
  const fileUrl = new URL(download.headers().location);
  expect(fileUrl.searchParams.get("download")).toBe("Week-3-Message-brokers.pdf");
  const file = await student.request.get(fileUrl.toString());
  expect(file.status()).toBe(200);
  expect(file.headers()["content-type"]).toBe("application/pdf");

  let refused = 0;
  await student.route(storagePath, async (route) => {
    if (refused > 0) return route.continue();
    refused += 1;
    await route.fulfill({ status: 400, contentType: "application/json", body: "{}" });
  });
  await student.reload();
  await expect(student.locator('canvas[data-painted="true"]')).toBeVisible({ timeout: 30000 });
  expect(refused).toBe(1);
  expect(await paintedPixels(student)).toBeGreaterThan(100);
  await student.unroute(storagePath);

  await student.goto(`/classes/${deck.class_id}`);
  await expect(student.getByRole("link", { name: new RegExp(deckTitle) })).toContainText("Viewed 2 / 5");

  const outsiderContext = await browser.newContext();
  const outsider = await outsiderContext.newPage();
  await logIn(outsider, outsiderEmail);
  expect((await outsider.goto(`/decks/${deck.id}`))?.status()).toBe(404);
  expect((await outsider.request.get(`/decks/${deck.id}/download`, { maxRedirects: 0 })).status()).toBe(404);

  await teacher.getByRole("button", { name: `Delete deck ${deckTitle}` }).click();
  await expect(teacher.getByText("No decks yet. Upload the first one.")).toBeVisible();
  const { data: left } = await admin.storage.from("decks").list(`${deck.class_id}/${deck.id}`);
  expect(left ?? []).toEqual([]);
  expect((await student.goto(`/decks/${deck.id}`))?.status()).toBe(404);

  await teacherContext.close();
  await studentContext.close();
  await outsiderContext.close();
});
