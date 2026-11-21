import Link from "next/link";
import { runOutlineAction, saveLesson } from "@/app/classes/routes-actions";
import { lessonPath } from "@/components/classes/teacher/outline/labels";
import { BracketLabel } from "@/components/ui/BracketLabel";
import type { LessonDetail } from "@/lib/routes";
import styles from "./editor/editor.module.css";
import { LessonForm } from "./editor/LessonForm";
import { PublishControl } from "./editor/PublishControl";

export type LessonEditorProps = {
  lesson: LessonDetail;
};

export function LessonEditor({ lesson }: LessonEditorProps) {
  return (
    <div className={styles.page}>
      <Link className={styles.back} href={`/classes/${lesson.classId}`}>
        Back to the class
      </Link>
      <header className={styles.head}>
        <p className={styles.moduleLabel}>
          <BracketLabel>{lesson.moduleTitle}</BracketLabel>
        </p>
        <h1 className={styles.title}>Edit lesson</h1>
        <PublishControl
          lessonId={lesson.id}
          title={lesson.title}
          published={lesson.published}
          action={runOutlineAction}
        />
        <Link className={styles.readerLink} href={lessonPath(lesson.classId, lesson.id)}>
          Open the lesson as a student sees it
        </Link>
      </header>
      <LessonForm key={lesson.id} lesson={lesson} saveAction={saveLesson} />
    </div>
  );
}
