import type { SupabaseClient } from "@supabase/supabase-js";
import { routeLimits } from "@/lib/config";
import type { Database } from "@/lib/database.types";

type Tables = Database["public"]["Tables"];
type ModuleRow = Pick<Tables["modules"]["Row"], "id" | "class_id" | "title" | "position">;
type LessonRow = Pick<
  Tables["lessons"]["Row"],
  "id" | "module_id" | "title" | "position" | "est_minutes" | "published_at"
>;

export type OutlineLesson = {
  id: string;
  moduleId: string;
  title: string;
  estMinutes: number;
  published: boolean;
  done: boolean;
};

export type OutlineModule = {
  id: string;
  classId: string;
  title: string;
  lessons: OutlineLesson[];
};

export type ClassOutline = {
  classId: string;
  modules: OutlineModule[];
};

export type RouteProgress = {
  done: number;
  published: number;
};

export type LessonDetail = {
  id: string;
  classId: string;
  moduleId: string;
  moduleTitle: string;
  title: string;
  bodyMd: string;
  estMinutes: number;
  published: boolean;
  revision: number;
};

const lessonColumns = "id, module_id, title, position, est_minutes, published_at";
const moduleColumns = "id, class_id, title, position";

function byPosition<Row extends { position: number; id: string }>(first: Row, second: Row): number {
  return first.position - second.position || first.id.localeCompare(second.id);
}

export function buildOutlines(modules: ModuleRow[], lessons: LessonRow[], doneLessonIds: string[]): ClassOutline[] {
  const done = new Set(doneLessonIds);
  const outlines = new Map<string, ClassOutline>();

  for (const moduleRow of [...modules].sort(byPosition)) {
    const outline = outlines.get(moduleRow.class_id) ?? { classId: moduleRow.class_id, modules: [] };
    outline.modules.push({
      id: moduleRow.id,
      classId: moduleRow.class_id,
      title: moduleRow.title,
      lessons: lessons
        .filter((lesson) => lesson.module_id === moduleRow.id)
        .sort(byPosition)
        .map((lesson) => ({
          id: lesson.id,
          moduleId: lesson.module_id,
          title: lesson.title,
          estMinutes: lesson.est_minutes,
          published: lesson.published_at !== null,
          done: done.has(lesson.id),
        })),
    });
    outlines.set(moduleRow.class_id, outline);
  }
  return [...outlines.values()];
}

export function outlineFor(outlines: ClassOutline[], classId: string): ClassOutline {
  return outlines.find((outline) => outline.classId === classId) ?? { classId, modules: [] };
}

export function publishedLessons(outline: ClassOutline): OutlineLesson[] {
  return outline.modules.flatMap((moduleItem) => moduleItem.lessons).filter((lesson) => lesson.published);
}

export function progressCount(outline: ClassOutline): RouteProgress {
  const published = publishedLessons(outline);
  return { done: published.filter((lesson) => lesson.done).length, published: published.length };
}

export function firstUnfinished(outline: ClassOutline): OutlineLesson | null {
  return publishedLessons(outline).find((lesson) => !lesson.done) ?? null;
}

export function lessonNeighbours(
  outline: ClassOutline,
  lessonId: string,
): { previous: OutlineLesson | null; next: OutlineLesson | null } {
  const lessons = publishedLessons(outline);
  const index = lessons.findIndex((lesson) => lesson.id === lessonId);
  if (index < 0) return { previous: null, next: null };
  return { previous: lessons[index - 1] ?? null, next: lessons[index + 1] ?? null };
}

export function classAltitude({ done, published }: RouteProgress): number {
  if (published <= 0) return 0;
  return Math.round((routeLimits.summitMeters * Math.min(Math.max(done, 0), published)) / published);
}

export function hubAltitude(progressByClass: RouteProgress[]): number {
  if (progressByClass.length === 0) return 0;
  const total = progressByClass.reduce((sum, progress) => sum + classAltitude(progress), 0);
  return Math.round(total / progressByClass.length);
}

export async function loadOutlines(supabase: SupabaseClient<Database>, userId: string): Promise<ClassOutline[]> {
  const [modules, lessons, progress] = await Promise.all([
    supabase.from("modules").select(moduleColumns),
    supabase.from("lessons").select(lessonColumns),
    supabase.from("lesson_progress").select("lesson_id").eq("student_id", userId),
  ]);
  return buildOutlines(
    modules.data ?? [],
    lessons.data ?? [],
    (progress.data ?? []).map((row) => row.lesson_id),
  );
}

export async function loadClassOutline(
  supabase: SupabaseClient<Database>,
  classId: string,
  userId: string,
): Promise<ClassOutline> {
  const { data: modules } = await supabase.from("modules").select(moduleColumns).eq("class_id", classId);
  const moduleIds = (modules ?? []).map((moduleRow) => moduleRow.id);
  if (moduleIds.length === 0) return { classId, modules: [] };

  const { data: lessons } = await supabase.from("lessons").select(lessonColumns).in("module_id", moduleIds);
  const lessonIds = (lessons ?? []).map((lesson) => lesson.id);
  const { data: progress } = lessonIds.length
    ? await supabase.from("lesson_progress").select("lesson_id").eq("student_id", userId).in("lesson_id", lessonIds)
    : { data: [] };

  return outlineFor(
    buildOutlines(modules ?? [], lessons ?? [], (progress ?? []).map((row) => row.lesson_id)),
    classId,
  );
}

export async function loadLesson(
  supabase: SupabaseClient<Database>,
  classId: string,
  lessonId: string,
): Promise<LessonDetail | null> {
  const { data } = await supabase
    .from("lessons")
    .select("id, module_id, title, body_md, est_minutes, published_at, revision, modules!inner(class_id, title)")
    .eq("id", lessonId)
    .eq("modules.class_id", classId)
    .maybeSingle();
  if (!data) return null;

  return {
    id: data.id,
    classId: data.modules.class_id,
    moduleId: data.module_id,
    moduleTitle: data.modules.title,
    title: data.title,
    bodyMd: data.body_md,
    estMinutes: data.est_minutes,
    published: data.published_at !== null,
    revision: data.revision,
  };
}
