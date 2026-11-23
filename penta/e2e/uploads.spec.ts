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
const feedback = "Clear structure. Cite the access matrix next time.";

test.skip(!serviceRoleKey, "needs the local development database");
test.setTimeout(120000);

function adminClient() {
  const url = assertLocalSupabase(process.env.NEXT_PUBLIC_SUPABASE_URL);
  return createClient(url, serviceRoleKey!, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function createUser(name: string, role: "teacher" | "student") {
  const email = `upload-${role}-${randomUUID().slice(0, 8)}@penta.test`;
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
    const { data: activities } = await admin.from("activities").select("id").in("class_id", classIds);
    const activityIds = (activities ?? []).map((row) => row.id);
    if (activityIds.length) {
      const { data: submissions } = await admin.from("submissions").select("file_path").in("activity_id", activityIds);
      const paths = (submissions ?? []).map((row) => row.file_path).filter((path): path is string => path !== null);
      if (paths.length) await admin.storage.from("submissions").remove(paths);
      await admin.from("submissions").delete().in("activity_id", activityIds);
      await admin.from("submission_uploads").delete().in("activity_id", activityIds);
      await admin.from("activities").delete().in("id", activityIds);
    }
    await admin.from("classes").delete().in("id", classIds);
  }
  for (const id of ids) await admin.auth.admin.deleteUser(id);
});

test("a student hands in a PDF, the teacher gives 18 of 20, and the gradebook agrees", async ({ browser }) => {
  const admin = adminClient();
  const teacherUser = await createUser("Upload Teacher", "teacher");
  const studentUser = await createUser("=SUM Student", "student");
  const outsiderUser = await createUser("Upload Outsider", "student");
  const title = `Access essay ${randomUUID().slice(0, 6)}`;

  const { data: classRow, error: classError } = await admin
    .from("classes")
    .insert({ code: "UP 101", title: "Upload Systems", section: "BSIT 3-1", term: "1st sem", teacher_id: teacherUser.id })
    .select("id")
    .single();
  if (classError) throw classError;
  const { error: enrollError } = await admin
    .from("enrollments")
    .insert({ class_id: classRow.id, student_id: studentUser.id });
  if (enrollError) throw enrollError;

  const teacherContext = await browser.newContext();
  const teacher = await teacherContext.newPage();
  await logIn(teacher, teacherUser.email);
  await teacher.goto(`/classes/${classRow.id}`);
  await teacher.getByLabel("Activity title").fill(title);
  await teacher.getByLabel("Points").fill("20");
  await teacher.getByRole("button", { name: "New upload activity" }).click();
  await expect(teacher).toHaveURL(/\/ops\/[0-9a-f-]{36}$/);
  const activityUrl = teacher.url();
  const activityId = activityUrl.split("/ops/")[1];
  await teacher.getByLabel("Due date").fill("2026-12-31T23:59");
  await teacher.getByRole("button", { name: "Save settings" }).click();
  await expect(teacher.getByRole("status").filter({ hasText: "Settings saved" })).toBeVisible();
  await teacher.getByRole("button", { name: "Publish activity" }).click();
  await expect(teacher.getByRole("button", { name: "Unpublish" })).toBeVisible();

  const studentContext = await browser.newContext();
  const student = await studentContext.newPage();
  const pageErrors: string[] = [];
  student.on("pageerror", (error) => pageErrors.push(error.message));
  await logIn(student, studentUser.email);
  await student.goto(`/classes/${classRow.id}`);
  await student.getByRole("link", { name: new RegExp(title) }).click();
  await expect(student).toHaveURL(new RegExp(`/ops/${activityId}$`));
  await expect(student.getByText("Dec 31, 2026, 11:59 PM, Manila time")).toBeVisible();

  const handIn = student.getByRole("form", { name: "Hand in a file" });
  await handIn.locator('input[type="file"]').setInputFiles({
    name: "essay.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("These are my notes, saved as text and renamed to look like a PDF."),
  });
  await handIn.getByRole("button", { name: "Hand in" }).click();
  await expect(handIn.getByText("That file is not a PDF. Export it again and retry.")).toBeVisible({ timeout: 30000 });
  const { data: none } = await admin.from("submissions").select("id").eq("activity_id", activityId);
  expect(none).toEqual([]);

  const pdf = buildPdf(2, 4000);
  await handIn.locator('input[type="file"]').setInputFiles({
    name: "../../my essay <final>.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from(pdf),
  });
  await handIn.getByRole("button", { name: "Hand in" }).click();
  await expect(student.getByRole("status").filter({ hasText: "Handed in" })).toBeVisible({ timeout: 30000 });
  await expect(student.getByText("Submitted", { exact: true })).toBeVisible();

  const { data: stored } = await admin
    .from("submissions")
    .select("id, student_id, file_path, file_name, size_bytes, is_late, score")
    .eq("activity_id", activityId);
  expect(stored).toHaveLength(1);
  const submission = stored![0];
  expect(submission.file_path).toMatch(new RegExp(`^${classRow.id}/${activityId}/${studentUser.id}/[0-9a-f-]{36}\\.pdf$`));
  expect(submission.file_name).not.toMatch(/[/\\]/);
  expect(submission).toMatchObject({ size_bytes: pdf.length, is_late: false, score: null });

  const fileUrl = `/ops/${activityId}/submission/${submission.id}/file`;
  const own = await student.request.get(fileUrl, { maxRedirects: 0 });
  expect(own.status()).toBe(302);
  expect(own.headers()["cache-control"]).toBe("no-store");
  const signed = new URL(own.headers().location);
  expect(signed.searchParams.get("download")).toBe("SUM-Student-" + title.replace(/ /g, "-") + ".pdf");
  const file = await student.request.get(signed.toString());
  expect(file.status()).toBe(200);
  expect(file.headers()["content-type"]).toBe("application/pdf");

  const outsiderContext = await browser.newContext();
  const outsider = await outsiderContext.newPage();
  await logIn(outsider, outsiderUser.email);
  expect((await outsider.request.get(fileUrl, { maxRedirects: 0 })).status()).toBe(404);
  expect((await outsider.goto(`/ops/${activityId}`))?.status()).toBe(404);
  expect((await outsider.request.get(`/classes/${classRow.id}/grades.csv`, { maxRedirects: 0 })).status()).toBe(404);
  expect((await student.request.get(`/classes/${classRow.id}/grades.csv`, { maxRedirects: 0 })).status()).toBe(404);

  await teacher.reload();
  await expect(teacher.getByRole("link", { name: "Open file" })).toHaveAttribute("href", fileUrl);
  await teacher.getByLabel(`Score for ${studentUser.name}`).fill("21");
  await teacher.getByLabel(`Feedback for ${studentUser.name}`).fill(feedback);
  await teacher.getByRole("button", { name: "Save grade" }).click();
  expect(
    await teacher
      .getByLabel(`Score for ${studentUser.name}`)
      .evaluate((input: HTMLInputElement) => input.validity.rangeOverflow),
  ).toBe(true);
  const { data: ungraded } = await admin.from("submissions").select("score").eq("id", submission.id).single();
  expect(ungraded?.score).toBeNull();
  await teacher.getByLabel(`Score for ${studentUser.name}`).fill("18");
  await teacher.getByLabel(`Feedback for ${studentUser.name}`).fill(feedback);
  await teacher.getByRole("button", { name: "Save grade" }).click();
  await expect(teacher.getByRole("status").filter({ hasText: "Grade saved" })).toBeVisible();
  await expect(teacher.getByText(/Graded by Upload Teacher/)).toBeVisible();

  const { data: log } = await admin
    .from("submission_grade_log")
    .select("old_score, new_score, graded_by")
    .eq("submission_id", submission.id);
  expect(log).toEqual([{ old_score: null, new_score: 18, graded_by: teacherUser.id }]);

  await student.reload();
  await expect(student.getByText("18 of 20").first()).toBeVisible();
  await expect(student.getByText(feedback)).toBeVisible();
  await expect(student.getByRole("button", { name: /Hand in|Replace file/ })).toHaveCount(0);

  await student.goto("/grades");
  await expect(student.getByRole("heading", { level: 1 })).toHaveText("Grades");
  await expect(student.getByText("18 of 20").first()).toBeVisible();
  await expect(student.getByText(/90%/).first()).toBeVisible();
  await expect(student.getByText("2,700 m").first()).toBeVisible();
  await student.goto("/hub");
  await expect(student.getByRole("heading", { level: 1 })).toContainText("2,700 m");

  await teacher.goto(`/classes/${classRow.id}/grades`);
  const row = teacher.getByRole("row", { name: new RegExp("=SUM Student") });
  await expect(row).toContainText("18");
  await expect(row).toContainText("18 of 20");
  await expect(row).toContainText("90%");
  await expect(teacher.getByRole("link", { name: "Export CSV" })).toHaveAttribute("href", `/classes/${classRow.id}/grades.csv`);

  const csv = await teacher.request.get(`/classes/${classRow.id}/grades.csv`);
  expect(csv.status()).toBe(200);
  expect(csv.headers()["content-type"]).toContain("text/csv");
  expect(csv.headers()["content-disposition"]).toContain('filename="UP-101-grades.csv"');
  expect(csv.headers()["cache-control"]).toBe("no-store");
  const bytes = await csv.body();
  expect([...bytes.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
  const lines = bytes.toString("utf8").slice(1).trim().split("\r\n");
  expect(lines).toHaveLength(2);
  expect(lines[0]).toContain(`"${title} (score, out of 20)"`);
  expect(lines[1].startsWith(`"'=SUM Student",18,`)).toBe(true);
  expect(lines[1].endsWith(",18,20,90,0")).toBe(true);
  expect(pageErrors).toEqual([]);

  await teacherContext.close();
  await studentContext.close();
  await outsiderContext.close();
});
