import { publishedLessons, type ClassOutline, type RouteProgress } from "@/lib/routes";

export type LessonPlace = {
  position: number;
  total: number;
};

export function lessonPlace(outline: ClassOutline, lessonId: string): LessonPlace | null {
  const lessons = publishedLessons(outline);
  const index = lessons.findIndex((lesson) => lesson.id === lessonId);
  if (index < 0) return null;
  return { position: index + 1, total: lessons.length };
}

export function isLessonDone(outline: ClassOutline, lessonId: string): boolean {
  return publishedLessons(outline).some((lesson) => lesson.id === lessonId && lesson.done);
}

export function placeLabel({ position, total }: LessonPlace): string {
  return `Lesson ${position} of ${total}`;
}

export function minutesLabel(minutes: number): string {
  return `${minutes} min read`;
}

export function progressLabel({ done, published }: RouteProgress): string {
  return `${done} of ${published} ${published === 1 ? "lesson" : "lessons"} done`;
}

export function classHref(classId: string): string {
  return `/classes/${classId}`;
}

export function lessonHref(classId: string, lessonId: string): string {
  return `/classes/${classId}/lessons/${lessonId}`;
}

export function editLessonHref(classId: string, lessonId: string): string {
  return `${lessonHref(classId, lessonId)}/edit`;
}
