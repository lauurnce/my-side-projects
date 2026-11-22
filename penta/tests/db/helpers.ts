import "./guard";
import { randomInt, randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "../../src/lib/database.types";

export type Client = SupabaseClient<Database>;
export type Actor = { id: string; email: string; client: Client };
export type JoinResult = { status: string; class_id?: string; retry_at?: string };
export type ReserveResult = { status: string; deck_id?: string; free_bytes?: number };
export type StorageUsage = { used_bytes: number; reserved_bytes: number; budget_bytes: number };
export type DeckKind = "pdf" | "native";
export type LiveAnswer = { status: string; session_id?: string; revision?: number };
export type LiveStateAnswer = { session_id: string | null; current_slide: number | null; revision: number; running: boolean };
export type SessionOptions = { slide?: number; activeMinutesAgo?: number; ended?: boolean };
export type QuizReply = { status: string; [field: string]: Json | undefined };
export type QuestionKind = "mcq" | "tf" | "ident";
export type QuestionSpec = { kind: QuestionKind | string; key: Json; prompt?: string | null; options?: Json; points?: number | null };
export type QuizOptions = {
  title?: string;
  instructions?: string;
  lessonId?: string | null;
  deckId?: string | null;
  dueAt?: string | null;
  attemptLimit?: number;
  timeLimitMin?: number | null;
  showAnswers?: "after_submit" | "after_due" | "never";
};
export type AttemptPatch = Database["public"]["Tables"]["quiz_attempts"]["Update"];
export type ActivityPatch = Database["public"]["Tables"]["activities"]["Update"];
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
export const activityColumns =
  "id, class_id, lesson_id, type, title, instructions_md, points, due_at, published_at, requires_deck_id, attempt_limit, time_limit_min, show_answers, created_by, created_at";
export const attemptColumns =
  "id, activity_id, student_id, attempt_no, started_at, expires_at, submitted_at, score, max_score, answers_seen_at";
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

export function secondsFromNow(seconds: number): string {
  return new Date(Date.now() + seconds * 1000).toISOString();
}

export function quizRow(classId: string, options: QuizOptions = {}) {
  return {
    class_id: classId,
    title: options.title ?? `Quiz ${randomUUID().slice(0, 8)}`,
    instructions_md: options.instructions ?? "Answer every question.",
    lesson_id: options.lessonId ?? null,
    requires_deck_id: options.deckId ?? null,
    due_at: options.dueAt ?? null,
    attempt_limit: options.attemptLimit ?? 1,
    time_limit_min: options.timeLimitMin ?? null,
    show_answers: options.showAnswers ?? "never",
  };
}

export async function draftQuiz(teacher: Actor, classId: string, options: QuizOptions = {}) {
  const { data, error } = await teacher.client
    .from("activities")
    .insert(quizRow(classId, options))
    .select(activityColumns)
    .single();
  if (error) throw error;
  return data;
}

export async function saveQuestion(client: Client, activityId: string, spec: QuestionSpec, questionId: string | null = null) {
  const { data, error } = await client.rpc("save_quiz_question", {
    target_activity: activityId,
    target_question: questionId as string,
    question_kind: spec.kind,
    question_prompt: (spec.prompt === undefined ? "Which answer is right?" : spec.prompt) as string,
    question_options: spec.options ?? null,
    question_points: (spec.points === undefined ? 1 : spec.points) as number,
    key_answers: spec.key,
  });
  return { result: data as QuizReply | null, error };
}

export async function addQuestion(teacher: Actor, activityId: string, spec: QuestionSpec): Promise<string> {
  const { result, error } = await saveQuestion(teacher.client, activityId, spec);
  if (error || result?.status !== "saved") throw new Error(`save_quiz_question answered ${result?.status ?? error?.code}`);
  return result.question_id as string;
}

export async function publishQuiz(client: Client, activityId: string, at = new Date().toISOString()) {
  return client.from("activities").update({ published_at: at }).eq("id", activityId).select(activityColumns);
}

export async function readActivity(activityId: string) {
  const { data, error } = await admin.from("activities").select(activityColumns).eq("id", activityId).maybeSingle();
  if (error) throw error;
  return data;
}

export async function setActivity(activityId: string, patch: ActivityPatch) {
  const { error } = await admin.from("activities").update(patch).eq("id", activityId);
  if (error) throw error;
}

export async function addQuiz(teacher: Actor, classId: string, questions: QuestionSpec[], options: QuizOptions = {}) {
  const draft = await draftQuiz(teacher, classId, options);
  const questionIds: string[] = [];
  for (const spec of questions) questionIds.push(await addQuestion(teacher, draft.id, spec));
  const published = await publishQuiz(teacher.client, draft.id);
  if (published.error || published.data.length !== 1) throw new Error("the quiz was not published");
  return { activity: published.data[0], questionIds };
}

export async function readQuestions(activityId: string) {
  const { data, error } = await admin
    .from("quiz_questions")
    .select("id, activity_id, kind, prompt, options, points, position")
    .eq("activity_id", activityId)
    .order("position");
  if (error) throw error;
  return data;
}

export async function readKey(questionId: string): Promise<Json | undefined> {
  const { data, error } = await admin.from("quiz_answer_keys").select("answers").eq("question_id", questionId).maybeSingle();
  if (error) throw error;
  return data?.answers;
}

export async function startAttempt(client: Client, activityId: string) {
  const { data, error } = await client.rpc("start_attempt", { target_activity: activityId });
  return { result: data as QuizReply | null, error };
}

export async function startedAttempt(client: Client, activityId: string): Promise<string> {
  const { result, error } = await startAttempt(client, activityId);
  if (error || result?.status !== "started") throw new Error(`start_attempt answered ${result?.status ?? error?.code}`);
  return result.attempt_id as string;
}

export async function attemptPaper(client: Client, attemptId: string) {
  const { data, error } = await client.rpc("attempt_paper", { target_attempt: attemptId });
  return { result: data as QuizReply | null, error };
}

export async function saveAnswer(client: Client, attemptId: string, questionId: string, answer: Json) {
  const { data, error } = await client.rpc("save_answer", {
    target_attempt: attemptId,
    target_question: questionId,
    answer,
  });
  return { result: data as QuizReply | null, error };
}

export async function submitAttempt(client: Client, attemptId: string, answers: Json = {}) {
  const { data, error } = await client.rpc("submit_attempt", { target_attempt: attemptId, answers });
  return { result: data as QuizReply | null, error };
}

export async function attemptReview(client: Client, attemptId: string) {
  const { data, error } = await client.rpc("attempt_review", { target_attempt: attemptId });
  return { result: data as QuizReply | null, error };
}

export async function readAttempt(attemptId: string) {
  const { data, error } = await admin.from("quiz_attempts").select(attemptColumns).eq("id", attemptId).single();
  if (error) throw error;
  return data;
}

export async function readAttempts(activityId: string, studentId?: string) {
  const query = admin.from("quiz_attempts").select(attemptColumns).eq("activity_id", activityId).order("attempt_no");
  const { data, error } = await (studentId ? query.eq("student_id", studentId) : query);
  if (error) throw error;
  return data;
}

export async function readAnswers(attemptId: string) {
  const { data, error } = await admin
    .from("quiz_attempt_answers")
    .select("attempt_id, question_id, answer, is_correct, saved_at")
    .eq("attempt_id", attemptId)
    .order("question_id");
  if (error) throw error;
  return data;
}

export async function setAttempt(attemptId: string, patch: AttemptPatch) {
  const { error } = await admin.from("quiz_attempts").update(patch).eq("id", attemptId);
  if (error) throw error;
}

export async function finishDeck(deckId: string, studentId: string, slideCount: number) {
  const first = Date.now() - 3600 * 1000;
  const rows = Array.from({ length: slideCount }, (_, index) => ({
    deck_id: deckId,
    student_id: studentId,
    slide_no: index + 1,
    viewed_at: new Date(first + index * 1000).toISOString(),
  }));
  const { error } = await admin.from("deck_views").insert(rows);
  if (error) throw error;
}

export async function removeFromClass(teacher: Actor, classId: string, studentId: string) {
  const { data, error } = await teacher.client.rpc("remove_student", { target_class: classId, target_student: studentId });
  if (error || data !== true) throw new Error("remove_student did not remove the student");
}

export async function enrolledStudent(classId: string, name = "student"): Promise<Actor> {
  const student = await createActor(name);
  await enroll(classId, student.id);
  return student;
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

async function idsWhere(table: "classes" | "modules" | "lessons" | "activities", column: string, parentIds: string[]): Promise<string[]> {
  const found: string[] = [];
  for (const chunk of chunksOf(parentIds)) {
    const { data, error } = await admin.from(table).select("id").in(column, chunk);
    if (error) throw error;
    found.push(...data.map((row) => row.id));
  }
  return found;
}

type Removable = "lesson_progress" | "lessons" | "modules" | "decks" | "live_sessions" | "quiz_attempts" | "activities";

async function deleteWhere(table: Removable, column: string, parentIds: string[]) {
  for (const chunk of chunksOf(parentIds)) {
    const { error } = await admin.from(table).delete().in(column, chunk);
    if (error) throw error;
  }
}

async function removeRoutes(userIds: string[]) {
  const classIds = await idsWhere("classes", "teacher_id", userIds);
  const moduleIds = await idsWhere("modules", "class_id", classIds);
  const lessonIds = await idsWhere("lessons", "module_id", moduleIds);
  const activityIds = [
    ...(await idsWhere("activities", "class_id", classIds)),
    ...(await idsWhere("activities", "created_by", userIds)),
  ];
  await deleteWhere("quiz_attempts", "activity_id", activityIds);
  await deleteWhere("quiz_attempts", "student_id", userIds);
  await deleteWhere("activities", "id", activityIds);
  await removeDecks(classIds);
  await deleteWhere("decks", "created_by", userIds);
  await deleteWhere("live_sessions", "teacher_id", userIds);
  await deleteWhere("lesson_progress", "student_id", userIds);
  await deleteWhere("lesson_progress", "lesson_id", lessonIds);
  await deleteWhere("lessons", "module_id", moduleIds);
  await deleteWhere("modules", "class_id", classIds);
}
