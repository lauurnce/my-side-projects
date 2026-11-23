import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

type Supabase = SupabaseClient<Database>;
type ActivityRow = Database["public"]["Tables"]["activities"]["Row"];
type AttemptRow = Database["public"]["Tables"]["quiz_attempts"]["Row"];

export type QuestionKind = "mcq" | "tf" | "ident";
export type ShowAnswers = "after_submit" | "after_due" | "never";
export type AnswerValue = number | boolean | string | null;
export type KeyValue = number | boolean | string[];

export type ActivityType = "quiz" | "upload";

export type Activity = {
  id: string;
  classId: string;
  type: ActivityType;
  lessonId: string | null;
  title: string;
  instructionsMd: string;
  points: number;
  dueAt: string | null;
  publishedAt: string | null;
  requiresDeckId: string | null;
  attemptLimit: number;
  timeLimitMin: number | null;
  showAnswers: ShowAnswers;
};

export type Attempt = {
  id: string;
  activityId: string;
  studentId: string;
  attemptNo: number;
  startedAt: string;
  expiresAt: string | null;
  submittedAt: string | null;
  score: number | null;
  maxScore: number;
};

export type PaperQuestion = {
  id: string;
  kind: QuestionKind;
  prompt: string;
  options: string[] | null;
  points: number;
  position: number;
};

export type TeacherQuestion = PaperQuestion & { key: KeyValue | null };

export type Paper =
  | { status: "not_found" }
  | { status: "submitted"; activityId: string }
  | {
      status: "open";
      activityId: string;
      attemptNo: number;
      expiresAt: string | null;
      now: string;
      questions: PaperQuestion[];
      answers: Record<string, AnswerValue>;
    };

export type ReviewItem = PaperQuestion & { answer: AnswerValue; isCorrect?: boolean; accepted?: KeyValue };

export type Review =
  | { status: "not_found" }
  | { status: "open"; activityId: string }
  | {
      status: "submitted";
      activityId: string;
      attemptNo: number;
      score: number;
      maxScore: number;
      submittedAt: string;
      reveal: boolean;
      items: ReviewItem[];
    };

export type ActivityState = "draft" | "open" | "in_progress" | "done" | "closed";

const activityColumns =
  "id, class_id, lesson_id, type, title, instructions_md, points, due_at, published_at, requires_deck_id, attempt_limit, time_limit_min, show_answers";
const attemptColumns =
  "id, activity_id, student_id, attempt_no, started_at, expires_at, submitted_at, score, max_score";
const kinds: readonly string[] = ["mcq", "tf", "ident"];

type Fields = Record<string, unknown>;

function fieldsOf(value: unknown): Fields | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Fields) : null;
}

function toShowAnswers(value: string): ShowAnswers {
  return value === "after_submit" || value === "after_due" ? value : "never";
}

export function toActivity(row: Pick<ActivityRow, keyof ActivityRow & string>): Activity {
  return {
    id: row.id,
    classId: row.class_id,
    type: row.type === "upload" ? "upload" : "quiz",
    lessonId: row.lesson_id,
    title: row.title,
    instructionsMd: row.instructions_md,
    points: row.points,
    dueAt: row.due_at,
    publishedAt: row.published_at,
    requiresDeckId: row.requires_deck_id,
    attemptLimit: row.attempt_limit,
    timeLimitMin: row.time_limit_min,
    showAnswers: toShowAnswers(row.show_answers),
  };
}

export function toAttempt(row: Omit<AttemptRow, "answers_seen_at">): Attempt {
  return {
    id: row.id,
    activityId: row.activity_id,
    studentId: row.student_id,
    attemptNo: row.attempt_no,
    startedAt: row.started_at,
    expiresAt: row.expires_at,
    submittedAt: row.submitted_at,
    score: row.score,
    maxScore: row.max_score,
  };
}

export function toAnswerValue(value: unknown): AnswerValue {
  return typeof value === "number" || typeof value === "boolean" || typeof value === "string" ? value : null;
}

export function toKeyValue(value: unknown): KeyValue | null {
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value) && value.every((item) => typeof item === "string")) return value as string[];
  return null;
}

export function toPaperQuestion(value: unknown): PaperQuestion | null {
  const fields = fieldsOf(value);
  if (!fields) return null;
  const { id, kind, prompt, options, points, position } = fields;
  if (typeof id !== "string" || typeof kind !== "string" || !kinds.includes(kind)) return null;
  if (typeof prompt !== "string" || typeof points !== "number" || typeof position !== "number") return null;
  const listed = Array.isArray(options) && options.every((item) => typeof item === "string") ? (options as string[]) : null;
  return { id, kind: kind as QuestionKind, prompt, options: listed, points, position };
}

function questionsOf(value: unknown): PaperQuestion[] {
  if (!Array.isArray(value)) return [];
  return value.map(toPaperQuestion).filter((question): question is PaperQuestion => question !== null);
}

export function toPaper(value: unknown): Paper {
  const fields = fieldsOf(value);
  if (!fields || typeof fields.activity_id !== "string") return { status: "not_found" };
  if (fields.status === "submitted") return { status: "submitted", activityId: fields.activity_id };
  if (fields.status !== "open" || typeof fields.now !== "string") return { status: "not_found" };

  const answers: Record<string, AnswerValue> = {};
  for (const [questionId, answer] of Object.entries(fieldsOf(fields.answers) ?? {})) {
    answers[questionId] = toAnswerValue(answer);
  }
  return {
    status: "open",
    activityId: fields.activity_id,
    attemptNo: typeof fields.attempt_no === "number" ? fields.attempt_no : 1,
    expiresAt: typeof fields.expires_at === "string" ? fields.expires_at : null,
    now: fields.now,
    questions: questionsOf(fields.questions),
    answers,
  };
}

function toReviewItem(value: unknown): ReviewItem | null {
  const question = toPaperQuestion({ ...fieldsOf(value), id: fieldsOf(value)?.question_id });
  const fields = fieldsOf(value);
  if (!question || !fields) return null;
  const item: ReviewItem = { ...question, answer: toAnswerValue(fields.answer) };
  if (typeof fields.is_correct === "boolean") item.isCorrect = fields.is_correct;
  const accepted = toKeyValue(fields.accepted);
  if (accepted !== null) item.accepted = accepted;
  return item;
}

export function toReview(value: unknown): Review {
  const fields = fieldsOf(value);
  if (!fields || typeof fields.activity_id !== "string") return { status: "not_found" };
  if (fields.status === "open") return { status: "open", activityId: fields.activity_id };
  const { score, max_score, submitted_at, attempt_no } = fields;
  if (fields.status !== "submitted" || typeof score !== "number" || typeof max_score !== "number") {
    return { status: "not_found" };
  }
  return {
    status: "submitted",
    activityId: fields.activity_id,
    attemptNo: typeof attempt_no === "number" ? attempt_no : 1,
    score,
    maxScore: max_score,
    submittedAt: typeof submitted_at === "string" ? submitted_at : "",
    reveal: fields.reveal === true,
    items: Array.isArray(fields.items)
      ? fields.items.map(toReviewItem).filter((item): item is ReviewItem => item !== null)
      : [],
  };
}

export function bestAttempt(attempts: Attempt[]): Attempt | null {
  const submitted = attempts.filter((attempt) => attempt.submittedAt !== null && attempt.score !== null);
  if (submitted.length === 0) return null;
  return submitted.reduce((best, attempt) => {
    if ((attempt.score ?? 0) !== (best.score ?? 0)) return (attempt.score ?? 0) > (best.score ?? 0) ? attempt : best;
    return (attempt.submittedAt ?? "") < (best.submittedAt ?? "") ? attempt : best;
  });
}

export function openAttempt(attempts: Attempt[]): Attempt | null {
  return attempts.find((attempt) => attempt.submittedAt === null) ?? null;
}

export function attemptsLeft(activity: Activity, attempts: Attempt[]): number {
  return Math.max(0, activity.attemptLimit - attempts.length);
}

export function isPastDue(activity: Activity, now: number): boolean {
  return activity.dueAt !== null && now >= new Date(activity.dueAt).getTime();
}

export function activityState(activity: Activity, attempts: Attempt[], now: number): ActivityState {
  if (activity.publishedAt === null) return "draft";
  if (openAttempt(attempts)) return "in_progress";
  if (bestAttempt(attempts) && (attemptsLeft(activity, attempts) === 0 || isPastDue(activity, now))) return "done";
  if (isPastDue(activity, now)) return "closed";
  return bestAttempt(attempts) ? "done" : "open";
}

export function percent(score: number, maxScore: number): number {
  if (maxScore <= 0) return 0;
  return Math.floor((100 * Math.min(Math.max(score, 0), maxScore)) / maxScore);
}

export async function loadActivity(supabase: Supabase, activityId: string): Promise<Activity | null> {
  const { data } = await supabase.from("activities").select(activityColumns).eq("id", activityId).maybeSingle();
  return data ? toActivity(data as ActivityRow) : null;
}

export async function loadClassActivities(supabase: Supabase, classId: string): Promise<Activity[]> {
  const { data } = await supabase
    .from("activities")
    .select(activityColumns)
    .eq("class_id", classId)
    .order("created_at")
    .order("id");
  return (data ?? []).map((row) => toActivity(row as ActivityRow));
}

export async function loadActivities(supabase: Supabase): Promise<Activity[]> {
  const { data } = await supabase.from("activities").select(activityColumns).order("created_at").order("id");
  return (data ?? []).map((row) => toActivity(row as ActivityRow));
}

export async function loadOwnAttempts(supabase: Supabase, studentId: string, activityIds: string[]): Promise<Attempt[]> {
  if (activityIds.length === 0) return [];
  const { data } = await supabase
    .from("quiz_attempts")
    .select(attemptColumns)
    .eq("student_id", studentId)
    .in("activity_id", activityIds)
    .order("attempt_no");
  return (data ?? []).map(toAttempt);
}

export async function loadActivityAttempts(supabase: Supabase, activityId: string): Promise<Attempt[]> {
  const { data } = await supabase
    .from("quiz_attempts")
    .select(attemptColumns)
    .eq("activity_id", activityId)
    .order("attempt_no");
  return (data ?? []).map(toAttempt);
}

export async function loadTeacherQuestions(supabase: Supabase, activityId: string): Promise<TeacherQuestion[]> {
  const [{ data: questions }, { data: keys }] = await Promise.all([
    supabase
      .from("quiz_questions")
      .select("id, kind, prompt, options, points, position")
      .eq("activity_id", activityId)
      .order("position")
      .order("id"),
    supabase.rpc("quiz_keys", { target_activity: activityId }),
  ]);
  const keyByQuestion = new Map((keys ?? []).map((row) => [row.question_id, toKeyValue(row.answers)]));
  return questionsOf(questions).map((question) => ({ ...question, key: keyByQuestion.get(question.id) ?? null }));
}

export async function loadPaper(supabase: Supabase, attemptId: string): Promise<Paper> {
  const { data } = await supabase.rpc("attempt_paper", { target_attempt: attemptId });
  return toPaper(data);
}

export async function loadReview(supabase: Supabase, attemptId: string): Promise<Review> {
  const { data } = await supabase.rpc("attempt_review", { target_attempt: attemptId });
  return toReview(data);
}

export type OpenPaper = Extract<Paper, { status: "open" }>;
export type SubmittedReview = Extract<Review, { status: "submitted" }>;
