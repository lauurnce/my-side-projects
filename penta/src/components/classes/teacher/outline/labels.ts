import type { ClassOutline } from "@/lib/routes";
import { countLabel } from "../helpers";

export type MoveDirection = "up" | "down";

export function moduleNumber(index: number): string {
  return `Module ${String(index + 1).padStart(2, "0")}`;
}

export function minutesLabel(minutes: number): string {
  return `${minutes} min`;
}

export function outlineCountLabel(outline: ClassOutline): string {
  const lessonCount = outline.modules.reduce((sum, moduleItem) => sum + moduleItem.lessons.length, 0);
  return `${countLabel(outline.modules.length, "module", "modules")}, ${countLabel(lessonCount, "lesson", "lessons")}`;
}

export function moveLabel(title: string, direction: MoveDirection): string {
  return `Move ${direction}: ${title}`;
}

export function publishWord(published: boolean): string {
  return published ? "Unpublish" : "Publish";
}

export function publishLabel(title: string, published: boolean): string {
  return `${publishWord(published)} ${title}`;
}

export function statusWord(published: boolean): string {
  return published ? "Published" : "Draft";
}

export function lessonPath(classId: string, lessonId: string): string {
  return `/classes/${classId}/lessons/${lessonId}`;
}

export function lessonEditPath(classId: string, lessonId: string): string {
  return `${lessonPath(classId, lessonId)}/edit`;
}
