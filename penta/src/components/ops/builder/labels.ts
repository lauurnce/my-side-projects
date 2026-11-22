import type { KeyValue, QuestionKind, TeacherQuestion } from "@/lib/quiz";

export const kinds: QuestionKind[] = ["mcq", "tf", "ident"];

export const kindLabels: Record<QuestionKind, string> = {
  mcq: "Multiple choice",
  tf: "True or false",
  ident: "Identification",
};

export const showAnswersChoices = [
  { value: "never", label: "Never" },
  { value: "after_submit", label: "Right after a student submits" },
  { value: "after_due", label: "After the due date" },
] as const;

export const builderNotes = {
  dueDate: "Manila time. Closes at the minute you set.",
  attempts: "With more than one attempt, a student can work out a short quiz by changing one answer at a time.",
  showAnswers: "Showing answers after the due date does not take them back if you move the date later.",
  timeLimit: "Leave it empty for no time limit.",
  instructions: "Markdown. Students read this before they start.",
  accepted: "Capital letters and extra spaces are ignored.",
  options: "Fill in at least two. Empty rows are left out.",
  published: "This quiz is published. Unpublish it to change questions.",
  rekey: "Changing a key regrades every submitted attempt.",
  noQuestions: "No questions yet. Add the first one.",
  noKey: "No answer key is saved for this one. Edit it and save it again.",
  started: "Students have started this quiz, so it cannot be unpublished or deleted. Close it instead.",
  deleteWarning: "This removes the quiz and all of its questions. It cannot be undone.",
} as const;

export type ShownOption = { text: string; correct: boolean };

function countLabel(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

export function pointsLabel(points: number): string {
  return countLabel(points, "point", "points");
}

export function questionCountLabel(count: number): string {
  return countLabel(count, "question", "questions");
}

export function pointsSummary(points: number, questionCount: number): string {
  return `${pointsLabel(points)}, ${questionCountLabel(questionCount)}`;
}

export function questionNumber(index: number): string {
  return `Question ${index + 1}`;
}

export function statusWord(published: boolean): string {
  return published ? "Published" : "Draft";
}

function isRightOption(kind: QuestionKind, key: KeyValue | null, index: number): boolean {
  if (kind === "tf") return typeof key === "boolean" && key === (index === 0);
  return key === index;
}

export function shownOptions(question: TeacherQuestion): ShownOption[] {
  if (question.kind === "ident") return [];
  const texts = question.kind === "tf" ? ["True", "False"] : (question.options ?? []);
  return texts.map((text, index) => ({ text, correct: isRightOption(question.kind, question.key, index) }));
}

export function shownAnswers(question: TeacherQuestion): string[] {
  return question.kind === "ident" && Array.isArray(question.key) ? question.key : [];
}

export function hasKey(question: TeacherQuestion): boolean {
  if (question.kind === "ident") return shownAnswers(question).length > 0;
  return shownOptions(question).some((option) => option.correct);
}
