import { setLessonDone } from "@/app/classes/lesson-actions";
import type { CurrentUser } from "@/lib/auth";
import { lessonNeighbours, loadClassOutline, progressCount, type LessonDetail } from "@/lib/routes";
import { createClient } from "@/lib/supabase/server";
import { isLessonDone, lessonPlace } from "./reader/helpers";
import { ReaderView } from "./reader/ReaderView";

export type LessonReaderProps = {
  user: CurrentUser;
  lesson: LessonDetail;
  isOwner: boolean;
};

export async function LessonReader({ user, lesson, isOwner }: LessonReaderProps) {
  const supabase = await createClient();
  const outline = await loadClassOutline(supabase, lesson.classId, user.id);
  const { previous, next } = lessonNeighbours(outline, lesson.id);

  return (
    <ReaderView
      lesson={lesson}
      isOwner={isOwner}
      done={isLessonDone(outline, lesson.id)}
      place={lessonPlace(outline, lesson.id)}
      previous={previous}
      next={next}
      progress={progressCount(outline)}
      action={setLessonDone}
    />
  );
}
