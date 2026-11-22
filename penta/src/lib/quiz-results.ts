import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import {
  bestAttempt,
  loadActivityAttempts,
  openAttempt,
  percent,
  type Activity,
  type Attempt,
  type QuestionKind,
} from "@/lib/quiz";

type Supabase = SupabaseClient<Database>;

export type RosterStudent = { id: string; fullName: string };

export type ResultQuestion = {
  id: string;
  kind: QuestionKind;
  prompt: string;
  points: number;
  position: number;
};

export type AnswerMark = { attemptId: string; questionId: string; isCorrect: boolean };

export type StudentStatus = "submitted" | "in_progress" | "not_started";

export type StudentRow = {
  studentId: string;
  name: string;
  enrolled: boolean;
  status: StudentStatus;
  bestScore: number | null;
  maxScore: number | null;
  attempts: number;
  inProgress: boolean;
  submittedAt: string | null;
};

export type ItemResult = ResultQuestion & {
  number: number;
  correct: number;
  total: number;
  percent: number | null;
};

export type ResultsSummary = {
  submitted: number;
  inProgress: number;
  notStarted: number;
  average: number | null;
  highest: number | null;
  lowest: number | null;
};

export type QuizResultsData = {
  roster: RosterStudent[];
  attempts: Attempt[];
  questions: ResultQuestion[];
  answers: AnswerMark[];
};

export const removedStudentName = "Removed student";
export const unknownStudentName = "Unknown student";

const answerIdsPerQuery = 100;
const answerRowsPerPage = 1000;
const kinds: readonly string[] = ["mcq", "tf", "ident"];

function byStudent(attempts: Attempt[]): Map<string, Attempt[]> {
  const grouped = new Map<string, Attempt[]>();
  for (const attempt of attempts) {
    grouped.set(attempt.studentId, [...(grouped.get(attempt.studentId) ?? []), attempt]);
  }
  return grouped;
}

function toStudentRow(studentId: string, name: string, enrolled: boolean, attempts: Attempt[]): StudentRow {
  const best = bestAttempt(attempts);
  const status = best ? "submitted" : attempts.length > 0 ? "in_progress" : "not_started";
  return {
    studentId,
    name,
    enrolled,
    status,
    bestScore: best?.score ?? null,
    maxScore: best?.maxScore ?? null,
    attempts: attempts.length,
    inProgress: openAttempt(attempts) !== null,
    submittedAt: best?.submittedAt ?? null,
  };
}

export function studentRows(roster: RosterStudent[], attempts: Attempt[]): StudentRow[] {
  const grouped = byStudent(attempts);
  const enrolledIds = new Set(roster.map((student) => student.id));
  const enrolled = roster.map((student) =>
    toStudentRow(student.id, student.fullName || unknownStudentName, true, grouped.get(student.id) ?? []),
  );
  const removed = [...grouped.entries()]
    .filter(([studentId]) => !enrolledIds.has(studentId))
    .map(([studentId, own]) => toStudentRow(studentId, removedStudentName, false, own));
  return [...enrolled, ...removed].sort(
    (first, second) =>
      first.name.localeCompare(second.name, "en") || first.studentId.localeCompare(second.studentId, "en"),
  );
}

export function firstSubmittedAttempts(attempts: Attempt[]): Attempt[] {
  const first = new Map<string, Attempt>();
  for (const attempt of attempts) {
    if (attempt.submittedAt === null) continue;
    const held = first.get(attempt.studentId);
    if (!held || attempt.attemptNo < held.attemptNo) first.set(attempt.studentId, attempt);
  }
  return [...first.values()];
}

export function itemAnalysis(questions: ResultQuestion[], attempts: Attempt[], answers: AnswerMark[]): ItemResult[] {
  const counted = new Set(firstSubmittedAttempts(attempts).map((attempt) => attempt.id));
  const correctAttempts = new Map<string, Set<string>>();
  for (const answer of answers) {
    if (!answer.isCorrect || !counted.has(answer.attemptId)) continue;
    const held = correctAttempts.get(answer.questionId) ?? new Set<string>();
    correctAttempts.set(answer.questionId, held.add(answer.attemptId));
  }
  return [...questions]
    .sort((first, second) => first.position - second.position || first.id.localeCompare(second.id, "en"))
    .map((question, index) => {
      const correct = correctAttempts.get(question.id)?.size ?? 0;
      return {
        ...question,
        number: index + 1,
        correct,
        total: counted.size,
        percent: counted.size === 0 ? null : percent(correct, counted.size),
      };
    });
}

export function itemSentence(item: Pick<ItemResult, "correct" | "total" | "percent">): string {
  if (item.percent === null) return "No submissions yet";
  return `${item.correct} of ${item.total} correct, ${item.percent}%`;
}

export function summary(rows: StudentRow[]): ResultsSummary {
  const scores = rows.flatMap((row) => (row.bestScore === null ? [] : [row.bestScore]));
  const total = scores.reduce((sum, score) => sum + score, 0);
  return {
    submitted: scores.length,
    inProgress: rows.filter((row) => row.status === "in_progress").length,
    notStarted: rows.filter((row) => row.status === "not_started").length,
    average: scores.length === 0 ? null : Math.round((10 * total) / scores.length) / 10,
    highest: scores.length === 0 ? null : Math.max(...scores),
    lowest: scores.length === 0 ? null : Math.min(...scores),
  };
}

export function countsLine(totals: ResultsSummary): string {
  return `${totals.submitted} submitted · ${totals.inProgress} in progress · ${totals.notStarted} not started`;
}

export function scoresLine(totals: ResultsSummary, points: number): string | null {
  if (totals.average === null || totals.highest === null || totals.lowest === null) return null;
  return `Average ${totals.average.toFixed(1)} of ${points} · Highest ${totals.highest} · Lowest ${totals.lowest}`;
}

async function loadRoster(supabase: Supabase, classId: string): Promise<RosterStudent[] | null> {
  const { data: enrollments, error } = await supabase.from("enrollments").select("student_id").eq("class_id", classId);
  if (error) return null;
  if (enrollments.length === 0) return [];

  const studentIds = enrollments.map((enrollment) => enrollment.student_id);
  const { data: profiles, error: profilesError } = await supabase
    .from("profiles")
    .select("id, full_name")
    .in("id", studentIds);
  if (profilesError) return null;

  const names = new Map(profiles.map((profile) => [profile.id, profile.full_name]));
  return studentIds.map((id) => ({ id, fullName: names.get(id) ?? unknownStudentName }));
}

async function loadQuestions(supabase: Supabase, activityId: string): Promise<ResultQuestion[] | null> {
  const { data, error } = await supabase
    .from("quiz_questions")
    .select("id, kind, prompt, points, position")
    .eq("activity_id", activityId)
    .order("position")
    .order("id");
  if (error) return null;
  return data
    .filter((row) => kinds.includes(row.kind))
    .map((row) => ({ ...row, kind: row.kind as QuestionKind }));
}

async function loadAnswerMarks(supabase: Supabase, attemptIds: string[]): Promise<AnswerMark[] | null> {
  const marks: AnswerMark[] = [];
  for (let start = 0; start < attemptIds.length; start += answerIdsPerQuery) {
    const ids = attemptIds.slice(start, start + answerIdsPerQuery);
    for (let from = 0; ; from += answerRowsPerPage) {
      const { data, error } = await supabase
        .from("quiz_attempt_answers")
        .select("attempt_id, question_id, is_correct")
        .in("attempt_id", ids)
        .order("attempt_id")
        .order("question_id")
        .range(from, from + answerRowsPerPage - 1);
      if (error) return null;
      for (const row of data) {
        marks.push({ attemptId: row.attempt_id, questionId: row.question_id, isCorrect: row.is_correct === true });
      }
      if (data.length < answerRowsPerPage) break;
    }
  }
  return marks;
}

export async function loadQuizResults(supabase: Supabase, activity: Activity): Promise<QuizResultsData | null> {
  await supabase.rpc("settle_attempts", { target_activity: activity.id });
  const [attempts, roster, questions] = await Promise.all([
    loadActivityAttempts(supabase, activity.id),
    loadRoster(supabase, activity.classId),
    loadQuestions(supabase, activity.id),
  ]);
  if (!roster || !questions) return null;

  const answers = await loadAnswerMarks(
    supabase,
    firstSubmittedAttempts(attempts).map((attempt) => attempt.id),
  );
  if (!answers) return null;
  return { roster, attempts, questions, answers };
}
