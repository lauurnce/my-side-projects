import type { CsvValue } from "@/lib/csv";
import { gradeTotals, type GradeCell, type GradeState, type GradeTotals } from "@/lib/grades";
import type { Activity } from "@/lib/quiz";

export type GradebookKind = "Quiz" | "Upload";

export type GradebookColumn = {
  id: string;
  title: string;
  kind: GradebookKind;
  points: number;
  dueAt: string | null;
};

export type GradebookCell = {
  state: GradeState;
  score: number | null;
  points: number;
  late: boolean;
};

export type GradebookRow = {
  studentId: string;
  name: string;
  removed: boolean;
  cells: GradebookCell[];
  totals: GradeTotals;
};

export type GradebookModel = {
  columns: GradebookColumn[];
  rows: GradebookRow[];
  complete: boolean;
};

export type GradebookInput = {
  activities: Pick<Activity, "id" | "type" | "title" | "points" | "dueAt">[];
  roster: { id: string; fullName: string }[];
  cells: GradeCell[];
};

export type TotalsText = { total: string; percent: string | null; notGraded: string | null };

export const removedStudentName = "Removed student";
export const lateWord = "Late";
export const gradedWord = "Graded";
export const noGradedWorkText = "No graded work yet";
export const countingNote =
  "Missing work counts as zero. Work that is handed in but not graded is left out of totals until it is graded.";
export const altitudeNote = "Altitude is progress, not a grade, and is not part of this gradebook.";

const stateWords: Record<Exclude<GradeState, "graded">, string> = {
  submitted: "Not graded",
  in_progress: "In progress",
  missing: "Missing",
  none: "",
};

function cellKey(studentId: string, activityId: string): string {
  return `${studentId} ${activityId}`;
}

function clampScore(score: number | null, points: number): number {
  return Math.min(Math.max(score ?? 0, 0), points);
}

function canBeLate(state: GradeState): boolean {
  return state === "graded" || state === "submitted";
}

function toColumn(activity: GradebookInput["activities"][number]): GradebookColumn {
  return {
    id: activity.id,
    title: activity.title,
    kind: activity.type === "upload" ? "Upload" : "Quiz",
    points: activity.points,
    dueAt: activity.dueAt,
  };
}

function toCell(column: GradebookColumn, cell: GradeCell | undefined): GradebookCell {
  if (!cell) return { state: "none", score: null, points: column.points, late: false };
  return {
    state: cell.state,
    score: cell.state === "graded" ? clampScore(cell.score, cell.points) : null,
    points: cell.points,
    late: cell.late && canBeLate(cell.state),
  };
}

function byNameThenId(first: { id: string; fullName: string }, second: { id: string; fullName: string }): number {
  return first.fullName.localeCompare(second.fullName, "en") || first.id.localeCompare(second.id, "en");
}

export function gradebookModel({ activities, roster, cells }: GradebookInput): GradebookModel {
  const columns = activities.map(toColumn);
  const columnIds = new Set(columns.map((column) => column.id));
  const shownCells = cells.filter((cell) => columnIds.has(cell.activityId));
  const cellByKey = new Map(shownCells.map((cell) => [cellKey(cell.studentId, cell.activityId), cell]));
  const enrolledIds = new Set(roster.map((student) => student.id));
  const removedIds = [...new Set(shownCells.map((cell) => cell.studentId))]
    .filter((studentId) => !enrolledIds.has(studentId))
    .sort((first, second) => first.localeCompare(second, "en"));

  const toRow = (studentId: string, name: string, removed: boolean): GradebookRow => {
    const rowCells = columns.map((column) => toCell(column, cellByKey.get(cellKey(studentId, column.id))));
    return { studentId, name, removed, cells: rowCells, totals: gradeTotals(rowCells) };
  };

  return {
    columns,
    rows: [
      ...[...roster].sort(byNameThenId).map((student) => toRow(student.id, student.fullName, false)),
      ...removedIds.map((studentId) => toRow(studentId, removedStudentName, true)),
    ],
    complete: roster.every((student) => columns.every((column) => cellByKey.has(cellKey(student.id, column.id)))),
  };
}

export function cellText(cell: Pick<GradebookCell, "state" | "score" | "points">): string {
  if (cell.state !== "graded") return stateWords[cell.state];
  return String(clampScore(cell.score, cell.points));
}

export function scoreOfPoints(cell: Pick<GradebookCell, "state" | "score" | "points">): string {
  return cell.state === "graded" ? `${cellText(cell)} of ${cell.points}` : "";
}

export function statusText(cell: Pick<GradebookCell, "state" | "score" | "points">): string {
  return cell.state === "graded" ? gradedWord : cellText(cell);
}

export function totalsText(totals: GradeTotals): TotalsText {
  const counted = totals.possible > 0 && totals.percent !== null;
  return {
    total: counted ? `${totals.earned} of ${totals.possible}` : noGradedWorkText,
    percent: counted ? `${totals.percent}%` : null,
    notGraded: totals.notGraded > 0 ? `Not graded: ${totals.notGraded}` : null,
  };
}

export function totalsLine(totals: GradeTotals): string {
  const text = totalsText(totals);
  return [text.total, text.percent, text.notGraded].filter((part) => part !== null).join(" · ");
}

function csvStatus(cell: GradebookCell): string {
  const late = cell.late && canBeLate(cell.state);
  if (cell.state === "graded") return late ? lateWord : "";
  return [cellText(cell), late ? lateWord : ""].filter((word) => word !== "").join(", ");
}

function csvScore(cell: GradebookCell): CsvValue {
  return cell.state === "graded" ? clampScore(cell.score, cell.points) : "";
}

export function gradebookCsvRows(model: GradebookModel): CsvValue[][] {
  const header: CsvValue[] = [
    "Student",
    ...model.columns.flatMap((column) => [
      `${column.title} (score, out of ${column.points})`,
      `${column.title} (status)`,
    ]),
    "Total earned",
    "Total possible",
    "Percent",
    "Not graded",
  ];
  const rows = model.rows.map((row): CsvValue[] => [
    row.name,
    ...row.cells.flatMap((cell) => [csvScore(cell), csvStatus(cell)]),
    row.totals.earned,
    row.totals.possible,
    row.totals.percent ?? "",
    row.totals.notGraded,
  ]);
  return [header, ...rows];
}

export function gradesFileName(classCode: string): string {
  const safe = classCode
    .replace(/[^A-Za-z0-9-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60)
    .replace(/-$/, "");
  return safe ? `${safe}-grades.csv` : "grades.csv";
}
