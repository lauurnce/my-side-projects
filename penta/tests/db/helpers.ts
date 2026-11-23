import "./guard";
import { randomInt, randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "../../src/lib/database.types";

export type Client = SupabaseClient<Database>;
export type Actor = { id: string; email: string; client: Client };
export type JoinResult = { status: string; class_id?: string; retry_at?: string };
export type ReserveResult = { status: string; deck_id?: string; free_bytes?: number };
export type StorageUsage = {
  used_bytes: number;
  reserved_bytes: number;
  budget_bytes: number;
  submission_bytes: number;
  total_bytes: number;
  block_bytes: number;
};
export type SubmissionKind = "pdf" | "docx";
export type SubmissionReply = {
  status: string;
  upload_id?: string;
  free_bytes?: number;
  submission_id?: string;
  activity_id?: string;
  old_path?: string | null;
  file_path?: string;
  regrade?: boolean;
  points?: number;
};
export type UploadOptions = { title?: string; points?: number; dueAt?: string | null; lessonId?: string | null; published?: boolean };
export type ReserveSubmissionArgs = { file_name: string | null; file_kind: string | null; declared_bytes: number | null };
export type SubmissionOptions = {
  kind?: SubmissionKind;
  fileName?: string;
  sizeBytes?: number;
  submittedAt?: string;
  late?: boolean;
  score?: number;
  feedback?: string;
  gradedBy?: string;
};
export type PendingOptions = { kind?: SubmissionKind; declaredBytes?: number; reservedAt?: string; fileName?: string };
export type UploadActivity = { id: string; class_id: string };
export type GradeCell = {
  student_id: string;
  activity_id: string;
  state: string;
  score: number | null;
  points: number;
  late: boolean;
  submitted_at: string | null;
};
export type ClassAltitude = {
  class_id: string;
  counts: boolean;
  meters: number;
  lessons_done: number;
  lessons_published: number;
  decks_finished: number;
  decks: number;
  points_earned: number;
  points_possible: number;
};
export type Altitude = { overall: number; classes: ClassAltitude[] };
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
export type ThreadTarget = { lesson?: string | null; activity?: string | null };
export type ThreadReply = { status: string; thread_id?: string; post_id?: string };
export type ViewPost = {
  id: string;
  parent_id: string | null;
  is_question: boolean;
  author_name: string;
  author_role: string;
  mine: boolean;
  can_edit: boolean;
  body: string;
  created_at: string;
  edited_at: string | null;
  hidden?: boolean;
  author_id?: string | null;
  author_in_class?: boolean;
  edit_count?: number;
};
export type ThreadView = {
  status: string;
  version?: number;
  thread?: {
    id: string;
    class_id: string;
    lesson_id: string | null;
    activity_id: string | null;
    target_title: string;
    title: string;
    locked: boolean;
    can_moderate: boolean;
  };
  posts?: ViewPost[];
};
export type SeededThread = {
  createdBy?: string | null;
  authorName?: string;
  createdAt?: string;
  title?: string;
  body?: string;
  hidden?: boolean;
};
export type SeededPost = {
  authorId?: string | null;
  authorName?: string;
  body?: string;
  parentId?: string | null;
  createdAt?: string;
  hidden?: boolean;
};
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
export const submissionBucket = "submissions";
export const docxType = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
export const submissionMime: Record<SubmissionKind, string> = { pdf: pdfType, docx: docxType };
export const submissionColumns =
  "id, activity_id, student_id, upload_id, file_path, file_name, mime, size_bytes, file_etag, submitted_at, is_late, score, feedback, graded_by, graded_at, files_removed_at";
export const pendingColumns = "id, activity_id, student_id, file_path, file_name, mime, declared_bytes, reserved_at";
export const gradeLogColumns =
  "id, submission_id, activity_id, student_id, old_score, new_score, feedback, file_path, file_name, size_bytes, file_etag, graded_by, graded_at";
export const deckColumns =
  "id, class_id, lesson_id, title, kind, pdf_path, original_path, slide_count, size_bytes, created_by, created_at, ready_at";
export const sessionColumns = "id, deck_id, teacher_id, current_slide, revision, started_at, active_at, ended_at";
export const activityColumns =
  "id, class_id, lesson_id, type, title, instructions_md, points, due_at, published_at, requires_deck_id, attempt_limit, time_limit_min, show_answers, created_by, created_at";
export const attemptColumns =
  "id, activity_id, student_id, attempt_no, started_at, expires_at, submitted_at, score, max_score, answers_seen_at";
export const threadColumns =
  "id, class_id, lesson_id, activity_id, title, created_by, created_at, locked, locked_by, locked_at, version";
export const postColumns =
  "id, thread_id, author_id, author_name, body, parent_id, is_question, created_at, edited_at, edit_count, hidden_at, hidden_by";
export const postEventColumns = "id, post_id, actor_id, kind, old_body, happened_at";
export const notFound = { status: "not_found" };
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

export function submissionPath(activity: UploadActivity, studentId: string, fileId: string, kind: SubmissionKind = "pdf") {
  return `${activity.class_id}/${activity.id}/${studentId}/${fileId}.${kind}`;
}

export async function addUpload(classId: string, createdBy: string, options: UploadOptions = {}) {
  const { data, error } = await admin
    .from("activities")
    .insert({
      class_id: classId,
      type: "upload",
      title: options.title ?? `Essay ${randomUUID().slice(0, 8)}`,
      instructions_md: "Hand in one file.",
      points: options.points ?? 20,
      due_at: options.dueAt ?? null,
      lesson_id: options.lessonId ?? null,
      created_by: createdBy,
    })
    .select("id")
    .single();
  if (error) throw error;
  if (options.published ?? true) await setActivity(data.id, { published_at: new Date().toISOString() });
  return (await readActivity(data.id))!;
}

export async function addSubmission(activity: UploadActivity, studentId: string, options: SubmissionOptions = {}) {
  const uploadId = randomUUID();
  const kind = options.kind ?? "pdf";
  const graded = options.score !== undefined;
  const { data, error } = await admin
    .from("submissions")
    .insert({
      activity_id: activity.id,
      student_id: studentId,
      upload_id: uploadId,
      file_path: submissionPath(activity, studentId, uploadId, kind),
      file_name: options.fileName ?? `essay.${kind}`,
      mime: submissionMime[kind],
      size_bytes: options.sizeBytes ?? 1024,
      file_etag: "seeded-etag",
      submitted_at: options.submittedAt ?? new Date().toISOString(),
      is_late: options.late ?? false,
      score: options.score ?? null,
      feedback: graded ? (options.feedback ?? "Clear and complete.") : null,
      graded_by: graded ? options.gradedBy! : null,
      graded_at: graded ? new Date().toISOString() : null,
    })
    .select(submissionColumns)
    .single();
  if (error) throw error;
  return data;
}

export async function addPending(activity: UploadActivity, studentId: string, options: PendingOptions = {}) {
  const id = randomUUID();
  const kind = options.kind ?? "pdf";
  const { data, error } = await admin
    .from("submission_uploads")
    .insert({
      id,
      activity_id: activity.id,
      student_id: studentId,
      file_path: submissionPath(activity, studentId, id, kind),
      file_name: options.fileName ?? `essay.${kind}`,
      mime: submissionMime[kind],
      declared_bytes: options.declaredBytes ?? 2048,
      reserved_at: options.reservedAt ?? new Date().toISOString(),
    })
    .select(pendingColumns)
    .single();
  if (error) throw error;
  return data;
}

export async function reserveSubmission(client: Client, activityId: string, change: Partial<ReserveSubmissionArgs> = {}) {
  const args = { target_activity: activityId, file_name: "essay.pdf", file_kind: "pdf", declared_bytes: 2048, ...change };
  const { data, error } = await client.rpc("reserve_submission", args as never);
  return { result: data as SubmissionReply | null, error };
}

export async function completeSubmission(client: Client, uploadId: string, realBytes: number | null = 2048, etag = "etag-1") {
  const { data, error } = await client.rpc("complete_submission", {
    target_upload: uploadId,
    real_bytes: realBytes as number,
    stored_etag: etag,
  });
  return { result: data as SubmissionReply | null, error };
}

export async function gradeSubmission(
  client: Client,
  submissionId: string,
  expectedUpload: string,
  score: number | null,
  feedback: string | null = "Clear and complete.",
) {
  const { data, error } = await client.rpc("grade_submission", {
    target_submission: submissionId,
    expected_upload: expectedUpload,
    new_score: score as number,
    new_feedback: feedback as string,
  });
  return { result: data as SubmissionReply | null, error };
}

export async function handIn(student: Actor, activityId: string, change: Partial<ReserveSubmissionArgs> = {}) {
  const reserved = await reserveSubmission(student.client, activityId, change);
  if (reserved.error || reserved.result?.status !== "reserved") {
    throw new Error(`reserve_submission answered ${reserved.result?.status ?? reserved.error?.code}`);
  }
  const completed = await completeSubmission(admin, reserved.result.upload_id!, change.declared_bytes ?? 2048);
  if (completed.error || completed.result?.status !== "completed") {
    throw new Error(`complete_submission answered ${completed.result?.status ?? completed.error?.code}`);
  }
  return (await readSubmission(completed.result.submission_id!))!;
}

export async function readSubmission(submissionId: string) {
  const { data, error } = await admin.from("submissions").select(submissionColumns).eq("id", submissionId).maybeSingle();
  if (error) throw error;
  return data;
}

export async function readSubmissionOf(activityId: string, studentId: string) {
  const { data, error } = await admin
    .from("submissions")
    .select(submissionColumns)
    .eq("activity_id", activityId)
    .eq("student_id", studentId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function setSubmission(submissionId: string, patch: Database["public"]["Tables"]["submissions"]["Update"]) {
  const { error } = await admin.from("submissions").update(patch).eq("id", submissionId);
  if (error) throw error;
}

export async function readPending(uploadId: string) {
  const { data, error } = await admin.from("submission_uploads").select(pendingColumns).eq("id", uploadId).maybeSingle();
  if (error) throw error;
  return data;
}

export async function readPendingOf(activityId: string, studentId: string) {
  const { data, error } = await admin
    .from("submission_uploads")
    .select(pendingColumns)
    .eq("activity_id", activityId)
    .eq("student_id", studentId);
  if (error) throw error;
  return data;
}

export async function setReservedAt(uploadId: string, reservedAt: string) {
  const { error } = await admin.from("submission_uploads").update({ reserved_at: reservedAt }).eq("id", uploadId);
  if (error) throw error;
}

export async function readGradeLog(submissionId: string) {
  const { data, error } = await admin
    .from("submission_grade_log")
    .select(gradeLogColumns)
    .eq("submission_id", submissionId)
    .order("graded_at");
  if (error) throw error;
  return data;
}

export async function storeSubmissionFile(path: string, bytes: Uint8Array, contentType = pdfType) {
  const { error } = await admin.storage.from(submissionBucket).upload(path, bytes, { contentType, upsert: false });
  if (error) throw error;
}

export async function submissionFileExists(path: string): Promise<boolean> {
  const { data, error } = await admin.storage.from(submissionBucket).exists(path);
  if (error) return false;
  return data;
}

export async function removeSubmissionFiles(paths: string[]) {
  if (paths.length === 0) return;
  const { error } = await admin.storage.from(submissionBucket).remove(paths);
  if (error) throw error;
}

export async function classGradebook(client: Client, classId: string) {
  const { data, error } = await client.rpc("class_gradebook", { target_class: classId });
  return { cells: data as GradeCell[] | null, error };
}

export async function myGrades(client: Client) {
  const { data, error } = await client.rpc("my_grades");
  return { cells: data as (Omit<GradeCell, "student_id"> & { class_id: string })[] | null, error };
}

export async function studentAltitude(client: Client, studentId: string) {
  const { data, error } = await client.rpc("student_altitude", { target_student: studentId });
  return { altitude: data as Altitude | null, error };
}

async function storedFilesUnder(bucket: string, folder: string): Promise<string[]> {
  const { data, error } = await admin.storage.from(bucket).list(folder, { limit: 1000 });
  if (error) throw error;
  const names: string[] = [];
  for (const entry of data) {
    const name = `${folder}/${entry.name}`;
    if (entry.id) names.push(name);
    else names.push(...(await storedFilesUnder(bucket, name)));
  }
  return names;
}

export async function removeSubmissions(classIds: string[]) {
  const activityIds = await idsWhere("activities", "class_id", classIds);
  await deleteWhere("submissions", "activity_id", activityIds);
  await deleteWhere("submission_uploads", "activity_id", activityIds);
  await deleteWhere("submission_grade_log", "activity_id", activityIds);
  for (const classId of classIds) await removeSubmissionFiles(await storedFilesUnder(submissionBucket, classId));
}

export async function threadRoom() {
  const [teacher, studentA, studentB] = await Promise.all([
    createActor("teacher", "teacher"),
    createActor("student-a"),
    createActor("student-b"),
  ]);
  const classroom = await createClass(teacher.id);
  await Promise.all([enroll(classroom.id, studentA.id), enroll(classroom.id, studentB.id)]);
  const week = await addModule(classroom.id, "Week 1");
  const lesson = await addLesson(week.id, "Backups", true);
  return { teacher, studentA, studentB, classroom, moduleId: week.id, lesson };
}

export function secondsAgo(seconds: number): string {
  return new Date(Date.now() - seconds * 1000).toISOString();
}

export async function askQuestion(
  client: Client,
  target: ThreadTarget,
  title: string | null = "Why does the restore fail?",
  body: string | null = "The restore stops at the first table.",
) {
  const { data, error } = await client.rpc("ask_question", {
    target_lesson: (target.lesson ?? null) as string,
    target_activity: (target.activity ?? null) as string,
    question_title: title as string,
    question_body: body as string,
  });
  return { result: data as ThreadReply | null, error };
}

export async function asked(actor: Actor, target: ThreadTarget, title?: string, body?: string) {
  const { result, error } = await askQuestion(actor.client, target, title, body);
  if (error || result?.status !== "asked") throw new Error(`ask_question answered ${result?.status ?? error?.code}`);
  return { threadId: result.thread_id!, postId: result.post_id! };
}

export async function addPost(client: Client, threadId: string, parentId: string | null = null, body: string | null = "Check the role first.") {
  const { data, error } = await client.rpc("add_post", {
    target_thread: threadId,
    target_parent: parentId as string,
    post_body: body as string,
  });
  return { result: data as ThreadReply | null, error };
}

export async function posted(actor: Actor, threadId: string, parentId: string | null = null, body?: string): Promise<string> {
  const { result, error } = await addPost(actor.client, threadId, parentId, body);
  if (error || result?.status !== "posted") throw new Error(`add_post answered ${result?.status ?? error?.code}`);
  return result.post_id!;
}

export async function editPost(client: Client, postId: string, body: string | null) {
  const { data, error } = await client.rpc("edit_post", { target_post: postId, post_body: body as string });
  return { result: data as ThreadReply | null, error };
}

export async function setPostHidden(client: Client, postId: string, hide: boolean) {
  const { data, error } = await client.rpc("set_post_hidden", { target_post: postId, hide });
  return { result: data as ThreadReply | null, error };
}

export async function setThreadLocked(client: Client, threadId: string, lock: boolean) {
  const { data, error } = await client.rpc("set_thread_locked", { target_thread: threadId, lock });
  return { result: data as ThreadReply | null, error };
}

export async function threadView(client: Client, threadId: string, knownVersion?: number) {
  const args = knownVersion === undefined ? { target_thread: threadId } : { target_thread: threadId, known_version: knownVersion };
  const { data, error } = await client.rpc("thread_view", args);
  return { view: data as ThreadView | null, error };
}

export async function classThreads(client: Client, classId: string) {
  const { data, error } = await client.rpc("class_threads", { target_class: classId });
  return { rows: data, error };
}

export async function postHistory(client: Client, postId: string) {
  const { data, error } = await client.rpc("post_history", { target_post: postId });
  return { rows: data, error };
}

export async function readThread(threadId: string) {
  const { data, error } = await admin.from("threads").select(threadColumns).eq("id", threadId).maybeSingle();
  if (error) throw error;
  return data;
}

export async function readPost(postId: string) {
  const { data, error } = await admin.from("posts").select(postColumns).eq("id", postId).maybeSingle();
  if (error) throw error;
  return data;
}

export async function readPosts(threadId: string) {
  const { data, error } = await admin.from("posts").select(postColumns).eq("thread_id", threadId).order("created_at").order("id");
  if (error) throw error;
  return data;
}

export async function readPostEvents(postId: string) {
  const { data, error } = await admin.from("post_events").select(postEventColumns).eq("post_id", postId).order("happened_at");
  if (error) throw error;
  return data;
}

export async function countPostsBy(authorId: string): Promise<number> {
  const { count, error } = await admin.from("posts").select("id", { count: "exact", head: true }).eq("author_id", authorId);
  if (error) throw error;
  return count ?? 0;
}

export async function countThreadsBy(userId: string): Promise<number> {
  const { count, error } = await admin.from("threads").select("id", { count: "exact", head: true }).eq("created_by", userId);
  if (error) throw error;
  return count ?? 0;
}

export async function countPostsIn(threadId: string): Promise<number> {
  const { count, error } = await admin.from("posts").select("id", { count: "exact", head: true }).eq("thread_id", threadId);
  if (error) throw error;
  return count ?? 0;
}

export async function seedThread(classId: string, target: ThreadTarget, options: SeededThread = {}) {
  const threadId = randomUUID();
  const postId = randomUUID();
  const createdAt = options.createdAt ?? minutesAgo(2 * 24 * 60);
  const thread = await admin.from("threads").insert({
    id: threadId,
    class_id: classId,
    lesson_id: target.lesson ?? null,
    activity_id: target.activity ?? null,
    title: options.title ?? `Question ${threadId.slice(0, 8)}`,
    created_by: options.createdBy ?? null,
    created_at: createdAt,
  });
  if (thread.error) throw thread.error;
  const post = await admin.from("posts").insert({
    id: postId,
    thread_id: threadId,
    author_id: options.createdBy ?? null,
    author_name: options.authorName ?? "Former classmate",
    body: options.body ?? "Where is this covered in the lesson?",
    is_question: true,
    created_at: createdAt,
    hidden_at: options.hidden ? createdAt : null,
  });
  if (post.error) throw post.error;
  return { threadId, postId };
}

export async function seedThreads(classId: string, target: ThreadTarget, count: number, options: SeededThread = {}): Promise<string[]> {
  const createdAt = options.createdAt ?? minutesAgo(2 * 24 * 60);
  const threads = Array.from({ length: count }, (_, index) => ({
    id: randomUUID(),
    class_id: classId,
    lesson_id: target.lesson ?? null,
    activity_id: target.activity ?? null,
    title: `${options.title ?? "Older question"} ${index + 1}`,
    created_by: options.createdBy ?? null,
    created_at: createdAt,
  }));
  for (let start = 0; start < threads.length; start += 100) {
    const batch = threads.slice(start, start + 100);
    const saved = await admin.from("threads").insert(batch);
    if (saved.error) throw saved.error;
    const questions = await admin.from("posts").insert(
      batch.map((thread) => ({
        thread_id: thread.id,
        author_id: options.createdBy ?? null,
        author_name: options.authorName ?? "Former classmate",
        body: options.body ?? "Where is this covered in the lesson?",
        is_question: true,
        created_at: createdAt,
        hidden_at: options.hidden ? createdAt : null,
      })),
    );
    if (questions.error) throw questions.error;
  }
  return threads.map((thread) => thread.id);
}

export async function seedPosts(threadId: string, posts: SeededPost[]): Promise<string[]> {
  const rows = posts.map((post) => {
    const createdAt = post.createdAt ?? minutesAgo(2 * 24 * 60);
    return {
      id: randomUUID(),
      thread_id: threadId,
      author_id: post.authorId ?? null,
      author_name: post.authorName ?? "Former classmate",
      body: post.body ?? "An older answer.",
      parent_id: post.parentId ?? null,
      created_at: createdAt,
      hidden_at: post.hidden ? createdAt : null,
    };
  });
  for (let start = 0; start < rows.length; start += 100) {
    const { error } = await admin.from("posts").insert(rows.slice(start, start + 100));
    if (error) throw error;
  }
  return rows.map((row) => row.id);
}

export async function setPostCreatedAt(postIds: string[], createdAt: string) {
  for (const chunk of chunksOf(postIds)) {
    const { error } = await admin.from("posts").update({ created_at: createdAt }).in("id", chunk);
    if (error) throw error;
  }
}

export async function forgetQuota(userIds: string[]) {
  const longAgo = minutesAgo(3 * 24 * 60);
  const dayAgo = minutesAgo(24 * 60 + 5);
  const posts = await admin.from("posts").update({ created_at: longAgo }).in("author_id", userIds).gt("created_at", dayAgo);
  if (posts.error) throw posts.error;
  const threads = await admin.from("threads").update({ created_at: longAgo }).in("created_by", userIds).gt("created_at", dayAgo);
  if (threads.error) throw threads.error;
}

export async function renameSelf(actor: Actor, fullName: string) {
  const { data, error } = await actor.client.from("profiles").update({ full_name: fullName }).eq("id", actor.id).select("id");
  if (error || data.length !== 1) throw new Error("the profile was not renamed");
}

export async function deleteAccount(actor: Actor) {
  const { error } = await admin.auth.admin.deleteUser(actor.id);
  if (error) throw error;
  const tracked = createdUserIds.indexOf(actor.id);
  if (tracked >= 0) createdUserIds.splice(tracked, 1);
}

export async function removeThreads(classIds: string[]) {
  const threadIds = await idsWhere("threads", "class_id", classIds);
  for (const chunk of chunksOf(threadIds)) {
    const events = await admin.from("post_events").select("post_id, posts!inner(thread_id)").in("posts.thread_id", chunk);
    if (events.error) throw events.error;
    await deleteWhere("post_events", "post_id", [...new Set(events.data.map((event) => event.post_id))]);
    const replies = await admin.from("posts").delete().in("thread_id", chunk).not("parent_id", "is", null);
    if (replies.error) throw replies.error;
  }
  await deleteWhere("posts", "thread_id", threadIds);
  await deleteWhere("threads", "id", threadIds);
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

async function idsWhere(table: "classes" | "modules" | "lessons" | "activities" | "threads", column: string, parentIds: string[]): Promise<string[]> {
  const found: string[] = [];
  for (const chunk of chunksOf(parentIds)) {
    const { data, error } = await admin.from(table).select("id").in(column, chunk);
    if (error) throw error;
    found.push(...data.map((row) => row.id));
  }
  return found;
}

type Removable =
  | "lesson_progress"
  | "lessons"
  | "modules"
  | "decks"
  | "live_sessions"
  | "quiz_attempts"
  | "activities"
  | "submissions"
  | "submission_uploads"
  | "submission_grade_log"
  | "post_events"
  | "posts"
  | "threads";

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
  await removeThreads(classIds);
  await deleteWhere("quiz_attempts", "activity_id", activityIds);
  await deleteWhere("quiz_attempts", "student_id", userIds);
  await removeSubmissions(classIds);
  for (const column of ["student_id", "graded_by"]) {
    await deleteWhere("submissions", column, userIds);
    await deleteWhere("submission_grade_log", column, userIds);
  }
  await deleteWhere("submissions", "activity_id", activityIds);
  await deleteWhere("submission_grade_log", "activity_id", activityIds);
  await deleteWhere("activities", "id", activityIds);
  await removeDecks(classIds);
  await deleteWhere("decks", "created_by", userIds);
  await deleteWhere("live_sessions", "teacher_id", userIds);
  await deleteWhere("lesson_progress", "student_id", userIds);
  await deleteWhere("lesson_progress", "lesson_id", lessonIds);
  await deleteWhere("lessons", "module_id", moduleIds);
  await deleteWhere("modules", "class_id", classIds);
}
