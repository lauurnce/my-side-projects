import "./guard";
import { randomInt, randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../src/lib/database.types";

export type Client = SupabaseClient<Database>;
export type Actor = { id: string; email: string; client: Client };
export type JoinResult = { status: string; class_id?: string; retry_at?: string };
export type ReserveResult = { status: string; deck_id?: string; free_bytes?: number };
export type StorageUsage = { used_bytes: number; reserved_bytes: number; budget_bytes: number };
export type DeckKind = "pdf" | "native";
export type LiveAnswer = { status: string; session_id?: string; revision?: number };
export type LiveStateAnswer = { session_id: string | null; current_slide: number | null; revision: number; running: boolean };
export type SessionOptions = { slide?: number; activeMinutesAgo?: number; ended?: boolean };
export type DeckOptions = {
  title?: string;
  kind?: DeckKind;
  lessonId?: string | null;
  ready?: boolean;
  slideCount?: number;
  sizeBytes?: number;
};

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const sessionless = { auth: { persistSession: false, autoRefreshToken: false } };
const testEmailSuffix = "@penta.test";
const joinCodeAlphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const createdUserIds: string[] = [];

export const refused = "42501";
export const checkFailed = "23514";
export const foreignKeyFailed = "23503";
export const duplicateKey = "23505";
export const limitReached = "P0001";
export const deckBucket = "decks";
export const pdfType = "application/pdf";
export const pptxType = "application/vnd.openxmlformats-officedocument.presentationml.presentation";
export const deckColumns =
  "id, class_id, lesson_id, title, kind, pdf_path, original_path, slide_count, size_bytes, created_by, created_at, ready_at";
export const sessionColumns = "id, deck_id, teacher_id, current_slide, revision, started_at, active_at, ended_at";
export const noLiveState: LiveStateAnswer = { session_id: null, current_slide: null, revision: 0, running: false };
export const joinCodePattern = /^[A-HJ-NP-Z2-9]{10}$/;
export const testPassword = randomUUID();
export const admin = createClient<Database>(url, serviceRoleKey, sessionless);
export const anon = createAnonClient();

export function createAnonClient(): Client {
  return createClient<Database>(url, anonKey, sessionless);
}

export function testEmail(name: string): string {
  return `${name}-${randomUUID().slice(0, 8)}${testEmailSuffix}`;
}

export function trackUser(id: string) {
  createdUserIds.push(id);
}

export async function createActor(name: string, role?: "teacher"): Promise<Actor> {
  const email = testEmail(name);
  const created = await admin.auth.admin.createUser({
    email,
    password: testPassword,
    email_confirm: true,
    app_metadata: role ? { role } : undefined,
  });
  if (created.error) throw created.error;
  trackUser(created.data.user.id);

  const client = createAnonClient();
  const signedIn = await client.auth.signInWithPassword({ email, password: testPassword });
  if (signedIn.error) throw signedIn.error;
  return { id: created.data.user.id, email, client };
}

export async function createClass(teacherId: string, title = "Systems Integration and Architecture 1") {
  const { data, error } = await admin
    .from("classes")
    .insert({ code: "INTE 301", title, section: "BSIT 3-1", term: "1st sem", teacher_id: teacherId })
    .select("id, title, teacher_id, join_code")
    .single();
  if (error) throw error;
  return data;
}

export async function readClass(classId: string) {
  const { data, error } = await admin
    .from("classes")
    .select("id, code, title, teacher_id, join_code")
    .eq("id", classId)
    .single();
  if (error) throw error;
  return data;
}

export async function readProfile(userId: string) {
  const { data, error } = await admin.from("profiles").select("id, full_name, role").eq("id", userId).single();
  if (error) throw error;
  return data;
}

export async function enroll(classId: string, studentId: string) {
  const { error } = await admin.from("enrollments").insert({ class_id: classId, student_id: studentId });
  if (error) throw error;
}

export async function countEnrollments(classId: string, studentId: string): Promise<number> {
  const { count, error } = await admin
    .from("enrollments")
    .select("*", { count: "exact", head: true })
    .eq("class_id", classId)
    .eq("student_id", studentId);
  if (error) throw error;
  return count ?? 0;
}

export async function createWorld() {
  const [teacher, otherTeacher, studentA, studentB, outsider] = await Promise.all([
    createActor("teacher", "teacher"),
    createActor("other-teacher", "teacher"),
    createActor("student-a"),
    createActor("student-b"),
    createActor("outsider"),
  ]);
  const classroom = await createClass(teacher.id);
  await enroll(classroom.id, studentA.id);
  await enroll(classroom.id, studentB.id);
  return { teacher, otherTeacher, studentA, studentB, outsider, classroom };
}

export async function createRouteWorld() {
  const [world, otherStudent] = await Promise.all([createWorld(), createActor("other-student")]);
  const otherClassroom = await createClass(world.otherTeacher.id, "Web Development");
  await enroll(otherClassroom.id, otherStudent.id);
  return { ...world, otherStudent, otherClassroom };
}

export async function addModule(classId: string, title = "Week 1") {
  const { data, error } = await admin
    .from("modules")
    .insert({ class_id: classId, title })
    .select("id, class_id, title, position, created_at")
    .single();
  if (error) throw error;
  return data;
}

export async function addLesson(moduleId: string, title = "Backups", published = false) {
  const { data, error } = await admin
    .from("lessons")
    .insert({ module_id: moduleId, title, body_md: "Take a full backup first.", est_minutes: 10 })
    .select("id")
    .single();
  if (error) throw error;
  if (published) await setPublished(data.id, true);
  return readLesson(data.id);
}

export async function setPublished(lessonId: string, published: boolean) {
  const { error } = await admin
    .from("lessons")
    .update({ published_at: published ? new Date().toISOString() : null })
    .eq("id", lessonId);
  if (error) throw error;
}

export async function readModule(moduleId: string) {
  const { data, error } = await admin
    .from("modules")
    .select("id, class_id, title, position, created_at")
    .eq("id", moduleId)
    .single();
  if (error) throw error;
  return data;
}

export async function readLesson(lessonId: string) {
  const { data, error } = await admin
    .from("lessons")
    .select("id, module_id, title, body_md, position, est_minutes, published_at, revision, created_at, updated_at")
    .eq("id", lessonId)
    .single();
  if (error) throw error;
  return data;
}

export async function modulePositions(classId: string) {
  const { data, error } = await admin.from("modules").select("id, position").eq("class_id", classId).order("position");
  if (error) throw error;
  return data;
}

export async function lessonPositions(moduleId: string) {
  const { data, error } = await admin.from("lessons").select("id, position").eq("module_id", moduleId).order("position");
  if (error) throw error;
  return data;
}

export async function countModules(classId: string): Promise<number> {
  const { count, error } = await admin.from("modules").select("id", { count: "exact", head: true }).eq("class_id", classId);
  if (error) throw error;
  return count ?? 0;
}

export async function countLessons(moduleId: string): Promise<number> {
  const { count, error } = await admin.from("lessons").select("id", { count: "exact", head: true }).eq("module_id", moduleId);
  if (error) throw error;
  return count ?? 0;
}

export async function markDone(lessonId: string, studentId: string) {
  const { error } = await admin.from("lesson_progress").insert({ lesson_id: lessonId, student_id: studentId });
  if (error) throw error;
}

export async function readProgress(lessonId: string, studentId?: string) {
  const query = admin.from("lesson_progress").select("lesson_id, student_id, completed_at").eq("lesson_id", lessonId);
  const { data, error } = await (studentId ? query.eq("student_id", studentId) : query);
  if (error) throw error;
  return data;
}

export function deckPaths(classId: string, deckId: string, kind: DeckKind = "pdf") {
  const folder = `${classId}/${deckId}`;
  return { pdf_path: `${folder}/slides.pdf`, original_path: kind === "native" ? `${folder}/original.pptx` : null };
}

export async function addDeck(classId: string, createdBy: string, options: DeckOptions = {}) {
  const id = randomUUID();
  const kind = options.kind ?? "pdf";
  const ready = options.ready ?? true;
  const { data, error } = await admin
    .from("decks")
    .insert({
      id,
      class_id: classId,
      lesson_id: options.lessonId ?? null,
      title: options.title ?? `Deck ${id.slice(0, 8)}`,
      kind,
      ...deckPaths(classId, id, kind),
      size_bytes: options.sizeBytes ?? 1024,
      created_by: createdBy,
      slide_count: ready ? (options.slideCount ?? 5) : null,
      ready_at: ready ? new Date().toISOString() : null,
    })
    .select(deckColumns)
    .single();
  if (error) throw error;
  return data;
}

export function addUnfinishedDeck(classId: string, createdBy: string, options: DeckOptions = {}) {
  return addDeck(classId, createdBy, { ...options, ready: false });
}

export async function readDeck(deckId: string) {
  const { data, error } = await admin.from("decks").select(deckColumns).eq("id", deckId).maybeSingle();
  if (error) throw error;
  return data;
}

export async function countDecks(classId: string): Promise<number> {
  const { count, error } = await admin.from("decks").select("id", { count: "exact", head: true }).eq("class_id", classId);
  if (error) throw error;
  return count ?? 0;
}

export async function readViews(deckId: string) {
  const { data, error } = await admin
    .from("deck_views")
    .select("deck_id, student_id, slide_no, viewed_at")
    .eq("deck_id", deckId)
    .order("slide_no");
  if (error) throw error;
  return data;
}

export async function recordView(deckId: string, studentId: string, slideNo: number) {
  const { error } = await admin.from("deck_views").insert({ deck_id: deckId, student_id: studentId, slide_no: slideNo });
  if (error) throw error;
}

export function minutesAgo(minutes: number): string {
  return new Date(Date.now() - minutes * 60 * 1000).toISOString();
}

export async function addSession(deckId: string, teacherId: string, options: SessionOptions = {}) {
  const { data, error } = await admin
    .from("live_sessions")
    .insert({
      deck_id: deckId,
      teacher_id: teacherId,
      current_slide: options.slide ?? 1,
      active_at: minutesAgo(options.activeMinutesAgo ?? 0),
      ended_at: options.ended ? new Date().toISOString() : null,
    })
    .select(sessionColumns)
    .single();
  if (error) throw error;
  return data;
}

export async function readSession(sessionId: string) {
  const { data, error } = await admin.from("live_sessions").select(sessionColumns).eq("id", sessionId).maybeSingle();
  if (error) throw error;
  return data;
}

export async function readSessions(deckId: string) {
  const { data, error } = await admin.from("live_sessions").select(sessionColumns).eq("deck_id", deckId).order("revision");
  if (error) throw error;
  return data;
}

export async function setSessionActive(sessionId: string, minutes: number) {
  const { error } = await admin.from("live_sessions").update({ active_at: minutesAgo(minutes) }).eq("id", sessionId);
  if (error) throw error;
}

export async function startLive(client: Client, deckId: string, slide: number | null = 1) {
  const { data, error } = await client.rpc("start_live", { target_deck: deckId, slide: slide as number });
  return { result: data as LiveAnswer | null, error };
}

export async function moveLive(client: Client, sessionId: string, slide: number | null) {
  const { data, error } = await client.rpc("move_live", { target_session: sessionId, slide: slide as number });
  return { result: data as LiveAnswer | null, error };
}

export async function liveState(client: Client, deckId: string) {
  const { data, error } = await client.rpc("live_state", { target_deck: deckId });
  return { state: data as LiveStateAnswer | null, error };
}

export async function startedSession(client: Client, deckId: string, slide = 1): Promise<string> {
  const { result, error } = await startLive(client, deckId, slide);
  if (error || result?.status !== "started" || !result.session_id) throw new Error("start_live did not start a session");
  return result.session_id;
}

export async function endedSession(client: Client, deckId: string, slide = 1): Promise<string> {
  const sessionId = await startedSession(client, deckId, slide);
  const { data, error } = await client.rpc("end_live", { target_session: sessionId });
  if (error || data !== "ended") throw new Error("end_live did not end the session");
  return sessionId;
}

export async function storeDeckFile(path: string, bytes: Uint8Array, contentType = pdfType) {
  const { error } = await admin.storage.from(deckBucket).upload(path, bytes, { contentType, upsert: false });
  if (error) throw error;
}

export async function deckFileExists(path: string): Promise<boolean> {
  const { data, error } = await admin.storage.from(deckBucket).exists(path);
  if (error) return false;
  return data;
}

export async function readUsage(client: Client) {
  const { data, error } = await client.rpc("storage_usage");
  return { usage: data as StorageUsage | null, error };
}

async function listDeckFolder(folder: string) {
  const { data, error } = await admin.storage.from(deckBucket).list(folder, { limit: 1000 });
  if (error) throw error;
  return data;
}

async function storedDeckFiles(classId: string): Promise<string[]> {
  const names: string[] = [];
  for (const deckFolder of await listDeckFolder(classId)) {
    const folder = `${classId}/${deckFolder.name}`;
    if (deckFolder.id) names.push(folder);
    else names.push(...(await listDeckFolder(folder)).map((file) => `${folder}/${file.name}`));
  }
  return names;
}

export async function removeDecks(classIds: string[]) {
  for (const chunk of chunksOf(classIds)) {
    const { error } = await admin.from("decks").delete().in("class_id", chunk);
    if (error) throw error;
  }
  for (const classId of classIds) {
    const names = await storedDeckFiles(classId);
    if (names.length === 0) continue;
    const { error } = await admin.storage.from(deckBucket).remove(names);
    if (error) throw error;
  }
}

export async function join(client: Client, code: string) {
  const { data, error } = await client.rpc("join_class", { code });
  return { result: data as JoinResult | null, error };
}

export function unusedJoinCode(): string {
  return Array.from({ length: 10 }, () => joinCodeAlphabet[randomInt(joinCodeAlphabet.length)]).join("");
}

export async function removeCreatedUsers() {
  await removeUsers(createdUserIds.splice(0));
}

export async function sweepTestUsers() {
  const leftovers: string[] = [];
  for (let page = 1; ; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    if (data.users.length === 0) break;
    leftovers.push(...data.users.filter((user) => user.email?.endsWith(testEmailSuffix)).map((user) => user.id));
  }
  await removeUsers(leftovers);
}

async function removeUsers(userIds: string[]) {
  if (userIds.length === 0) return;
  await removeRoutes(userIds);
  const classes = await admin.from("classes").delete().in("teacher_id", userIds);
  if (classes.error) throw classes.error;
  for (const userId of userIds) {
    const { error } = await admin.auth.admin.deleteUser(userId);
    if (error) throw error;
  }
}

function chunksOf(ids: string[]): string[][] {
  const chunks: string[][] = [];
  for (let start = 0; start < ids.length; start += 50) chunks.push(ids.slice(start, start + 50));
  return chunks;
}

async function idsWhere(table: "classes" | "modules" | "lessons", column: string, parentIds: string[]): Promise<string[]> {
  const found: string[] = [];
  for (const chunk of chunksOf(parentIds)) {
    const { data, error } = await admin.from(table).select("id").in(column, chunk);
    if (error) throw error;
    found.push(...data.map((row) => row.id));
  }
  return found;
}

async function deleteWhere(table: "lesson_progress" | "lessons" | "modules" | "decks" | "live_sessions", column: string, parentIds: string[]) {
  for (const chunk of chunksOf(parentIds)) {
    const { error } = await admin.from(table).delete().in(column, chunk);
    if (error) throw error;
  }
}

async function removeRoutes(userIds: string[]) {
  const classIds = await idsWhere("classes", "teacher_id", userIds);
  const moduleIds = await idsWhere("modules", "class_id", classIds);
  const lessonIds = await idsWhere("lessons", "module_id", moduleIds);
  await removeDecks(classIds);
  await deleteWhere("decks", "created_by", userIds);
  await deleteWhere("live_sessions", "teacher_id", userIds);
  await deleteWhere("lesson_progress", "student_id", userIds);
  await deleteWhere("lesson_progress", "lesson_id", lessonIds);
  await deleteWhere("lessons", "module_id", moduleIds);
  await deleteWhere("modules", "class_id", classIds);
}
