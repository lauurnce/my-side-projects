import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

type Supabase = SupabaseClient<Database>;

export type GradeState = "graded" | "submitted" | "in_progress" | "missing" | "none";

export type GradeCell = {
  studentId: string;
  activityId: string;
  state: GradeState;
  score: number | null;
  points: number;
  late: boolean;
  submittedAt: string | null;
};

export type OwnGradeCell = Omit<GradeCell, "studentId"> & { classId: string };

export type GradeTotals = { earned: number; possible: number; percent: number | null; notGraded: number };

export type ClassAltitude = {
  classId: string;
  counts: boolean;
  meters: number;
  lessonsDone: number;
  lessonsPublished: number;
  decksFinished: number;
  decks: number;
  pointsEarned: number;
  pointsPossible: number;
};

export type Altitude = { overall: number; classes: ClassAltitude[] };

type CellRow = {
  activity_id: string;
  state: string;
  score: number | null;
  points: number;
  late: boolean;
  submitted_at: string | null;
};

const states: readonly string[] = ["graded", "submitted", "in_progress", "missing", "none"];

export const noAltitude: Altitude = { overall: 0, classes: [] };

function toState(value: string): GradeState {
  return states.includes(value) ? (value as GradeState) : "none";
}

function cellFields(row: CellRow) {
  return {
    activityId: row.activity_id,
    state: toState(row.state),
    score: row.score,
    points: row.points,
    late: row.late,
    submittedAt: row.submitted_at,
  };
}

export function toGradeCell(row: CellRow & { student_id: string }): GradeCell {
  return { studentId: row.student_id, ...cellFields(row) };
}

export function toOwnGradeCell(row: CellRow & { class_id: string }): OwnGradeCell {
  return { classId: row.class_id, ...cellFields(row) };
}

export function countsTowardTotal(state: GradeState): boolean {
  return state === "graded" || state === "missing";
}

export function gradeTotals(cells: Pick<GradeCell, "state" | "score" | "points">[]): GradeTotals {
  const counted = cells.filter((cell) => countsTowardTotal(cell.state));
  const possible = counted.reduce((sum, cell) => sum + cell.points, 0);
  const earned = counted.reduce((sum, cell) => sum + Math.min(Math.max(cell.score ?? 0, 0), cell.points), 0);
  return {
    earned,
    possible,
    percent: possible > 0 ? Math.floor((100 * earned) / possible) : null,
    notGraded: cells.filter((cell) => cell.state === "submitted").length,
  };
}

function numberOf(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

export function toAltitude(value: unknown): Altitude {
  if (typeof value !== "object" || value === null) return noAltitude;
  const { overall, classes } = value as { overall?: unknown; classes?: unknown };
  if (!Array.isArray(classes)) return noAltitude;
  return {
    overall: numberOf(overall),
    classes: classes
      .filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null)
      .filter((item) => typeof item.class_id === "string")
      .map((item) => ({
        classId: item.class_id as string,
        counts: item.counts === true,
        meters: numberOf(item.meters),
        lessonsDone: numberOf(item.lessons_done),
        lessonsPublished: numberOf(item.lessons_published),
        decksFinished: numberOf(item.decks_finished),
        decks: numberOf(item.decks),
        pointsEarned: numberOf(item.points_earned),
        pointsPossible: numberOf(item.points_possible),
      })),
  };
}

export function altitudeFor(altitude: Altitude, classId: string): ClassAltitude | null {
  return altitude.classes.find((item) => item.classId === classId) ?? null;
}

const pageRows = 1000;
const pageLimit = 50;

async function readPages<Row>(
  readPage: (from: number, to: number) => PromiseLike<{ data: Row[] | null; error: unknown }>,
): Promise<Row[]> {
  const rows: Row[] = [];
  for (let page = 0; page < pageLimit; page += 1) {
    const { data, error } = await readPage(page * pageRows, (page + 1) * pageRows - 1);
    if (error || !data) return rows;
    rows.push(...data);
    if (data.length < pageRows) return rows;
  }
  return rows;
}

export async function loadClassGradebook(supabase: Supabase, classId: string): Promise<GradeCell[]> {
  const rows = await readPages((from, to) =>
    supabase
      .rpc("class_gradebook", { target_class: classId })
      .order("student_id")
      .order("activity_id")
      .range(from, to),
  );
  return rows.map(toGradeCell);
}

export async function loadMyGrades(supabase: Supabase): Promise<OwnGradeCell[]> {
  const rows = await readPages((from, to) =>
    supabase.rpc("my_grades").order("class_id").order("activity_id").range(from, to),
  );
  return rows.map(toOwnGradeCell);
}

export async function loadAltitude(supabase: Supabase, studentId: string): Promise<Altitude> {
  const { data } = await supabase.rpc("student_altitude", { target_student: studentId });
  return toAltitude(data);
}
