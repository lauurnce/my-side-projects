import type { LessonDetail } from "@/lib/routes";

export type LessonEditorProps = {
  lesson: LessonDetail;
};

export function LessonEditor({ lesson }: LessonEditorProps) {
  return <h1>{lesson.title}</h1>;
}
