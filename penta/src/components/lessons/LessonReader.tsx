import type { CurrentUser } from "@/lib/auth";
import type { LessonDetail } from "@/lib/routes";

export type LessonReaderProps = {
  user: CurrentUser;
  lesson: LessonDetail;
  isOwner: boolean;
};

export async function LessonReader({ lesson }: LessonReaderProps) {
  return <h1>{lesson.title}</h1>;
}
