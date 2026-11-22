import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { assertLocalSupabase } from "../src/lib/supabase/local";
import { buildPdf } from "../tests/fixtures/deck-files";

if (existsSync(".env.local")) process.loadEnvFile(".env.local");

const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const password = `pw-${randomUUID()}`;
const createdEmails: string[] = [];
const slideCount = 8;
const followLimitMilliseconds = 1500;

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

async function openDeck(page: Page, deckId: string) {
  await page.goto(`/decks/${deckId}`);
  await expect(page.locator('canvas[data-painted="true"]')).toBeVisible({ timeout: 30000 });
}

function counter(page: Page, slide: number) {
  return page.getByText(`Slide ${slide} / ${slideCount}`, { exact: true });
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

test("a student follows a live deck, browses freely, jumps back and survives going offline", async ({ browser }, testInfo) => {
  const admin = adminClient();
  const teacherUser = await createUser("Live Teacher", "teacher");
  const studentUser = await createUser("Live Student", "student");
  const deckTitle = `Live deck ${randomUUID().slice(0, 6)}`;

  const { data: classRow, error: classError } = await admin
    .from("classes")
    .insert({ code: "LV 101", title: "Live Systems", section: "BSIT 3-1", term: "1st sem", teacher_id: teacherUser.id })
    .select("id")
    .single();
  if (classError) throw classError;
  const { error: enrollError } = await admin
    .from("enrollments")
    .insert({ class_id: classRow.id, student_id: studentUser.id });
  if (enrollError) throw enrollError;

  const deckId = randomUUID();
  const pdf = buildPdf(slideCount, 150000);
  const pdfPath = `${classRow.id}/${deckId}/slides.pdf`;
  const stored = await admin.storage.from("decks").upload(pdfPath, Buffer.from(pdf), { contentType: "application/pdf" });
  if (stored.error) throw stored.error;
  const { error: deckError } = await admin.from("decks").insert({
    id: deckId,
    class_id: classRow.id,
    title: deckTitle,
    kind: "pdf",
    pdf_path: pdfPath,
    slide_count: slideCount,
    size_bytes: pdf.length,
    created_by: teacherUser.id,
    ready_at: new Date().toISOString(),
  });
  if (deckError) throw deckError;

  const teacherContext = await browser.newContext();
  const studentContext = await browser.newContext();
  const teacher = await teacherContext.newPage();
  const student = await studentContext.newPage();
  const pageErrors: string[] = [];
  teacher.on("pageerror", (error) => pageErrors.push(`teacher: ${error.message}`));
  student.on("pageerror", (error) => pageErrors.push(`student: ${error.message}`));
  await logIn(teacher, teacherUser.email);
  await logIn(student, studentUser.email);

  await openDeck(student, deckId);
  await openDeck(teacher, deckId);
  await expect(student.getByRole("button", { name: "Join live" })).toHaveCount(0);
  await expect(student.getByRole("button", { name: "Present" })).toHaveCount(0);

  await teacher.getByRole("button", { name: "Next slide" }).click();
  await expect(counter(teacher, 2)).toBeVisible();
  await teacher.getByRole("button", { name: "Present" }).click();
  await expect(teacher.getByRole("button", { name: "End session" })).toBeVisible();

  await expect(student.getByRole("button", { name: "Join live" })).toBeVisible({ timeout: 40000 });
  await expect(counter(student, 1)).toBeVisible();
  await student.getByRole("button", { name: "Join live" }).click();
  await expect(counter(student, 2)).toBeVisible();
  await expect(student.getByRole("button", { name: "Browse freely" })).toBeVisible();
  await expect(teacher.getByText("1 student following")).toBeVisible({ timeout: 15000 });

  const timings: string[] = [];
  for (const slide of [3, 4, 5]) {
    await teacher.waitForTimeout(600);
    const started = Date.now();
    await teacher.getByRole("button", { name: "Next slide" }).click();
    await expect(counter(student, slide)).toBeVisible({ timeout: followLimitMilliseconds });
    const elapsed = Date.now() - started;
    timings.push(`slide ${slide}: ${elapsed} ms`);
    expect(elapsed).toBeLessThan(followLimitMilliseconds);
  }
  console.log(`[${testInfo.project.name}] follow times: ${timings.join(", ")}`);
  testInfo.annotations.push({ type: "follow times", description: timings.join(", ") });

  await student.getByRole("button", { name: "Browse freely" }).click();
  await student.getByRole("button", { name: "Previous slide" }).click();
  await expect(counter(student, 4)).toBeVisible();
  await teacher.getByRole("button", { name: "Next slide" }).click();
  await expect(counter(teacher, 6)).toBeVisible();
  await student.waitForTimeout(2000);
  await expect(counter(student, 4)).toBeVisible();
  await student.getByRole("button", { name: "Jump back" }).click();
  await expect(counter(student, 6)).toBeVisible();

  await studentContext.setOffline(true);
  await teacher.waitForTimeout(600);
  await teacher.getByRole("button", { name: "Next slide" }).click();
  await teacher.waitForTimeout(600);
  await teacher.getByRole("button", { name: "Next slide" }).click();
  await expect(counter(teacher, 8)).toBeVisible();
  await expect(student.getByText(/No contact with the server since/)).toBeVisible({ timeout: 30000 });
  await expect(counter(student, 8)).toHaveCount(0);
  await studentContext.setOffline(false);
  await expect(counter(student, 8)).toBeVisible({ timeout: 10000 });
  await expect(student.getByText(/No contact with the server since/)).toHaveCount(0);

  await teacher.reload();
  await expect(teacher.getByRole("button", { name: "End session" })).toBeVisible({ timeout: 30000 });
  await expect(counter(teacher, 8)).toBeVisible();
  await teacher.getByRole("button", { name: "Previous slide" }).click();
  await expect(counter(student, 7)).toBeVisible({ timeout: 5000 });

  const hub = await studentContext.newPage();
  await hub.goto("/hub");
  await expect(hub.getByText("Live now").first()).toBeVisible();
  await expect(hub.getByRole("link", { name: "Join live" }).first()).toHaveAttribute("href", `/decks/${deckId}`);
  await hub.goto(`/classes/${classRow.id}`);
  await expect(hub.getByText(`Live now: ${deckTitle}`, { exact: false })).toBeVisible();
  await expect(hub.getByRole("link", { name: new RegExp(deckTitle) }).filter({ hasText: "slides" })).toContainText("LIVE");
  await hub.close();

  const { data: rows } = await admin.from("live_sessions").select("current_slide, ended_at").eq("deck_id", deckId);
  expect(rows).toEqual([{ current_slide: 7, ended_at: null }]);

  await teacher.getByRole("button", { name: "End session" }).click();
  await expect(teacher.getByRole("button", { name: "Present" })).toBeVisible();
  await expect(student.getByRole("button", { name: "Browse freely" })).toHaveCount(0, { timeout: 5000 });
  await expect(student.getByRole("button", { name: "Join live" })).toHaveCount(0);
  await expect(student.getByText("Live", { exact: true })).toHaveCount(0);
  await expect(counter(student, 7)).toBeVisible();
  await student.getByRole("button", { name: "Next slide" }).click();
  await expect(counter(student, 8)).toBeVisible();

  const { data: ended } = await admin.from("live_sessions").select("ended_at").eq("deck_id", deckId);
  expect(ended?.every((row) => row.ended_at !== null)).toBe(true);
  expect(pageErrors).toEqual([]);

  await teacherContext.close();
  await studentContext.close();
});
