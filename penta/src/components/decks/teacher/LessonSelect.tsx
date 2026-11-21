import styles from "./decks.module.css";
import type { LessonGroup } from "./labels";

export type LessonSelectProps = {
  groups: LessonGroup[];
  defaultValue?: string;
  spokenLabel?: string;
};

export function LessonSelect({ groups, defaultValue = "", spokenLabel }: LessonSelectProps) {
  return (
    <label className={styles.selectField}>
      <span className={styles.selectLabel}>Link to a lesson</span>
      <select className={styles.select} name="lessonId" defaultValue={defaultValue} aria-label={spokenLabel}>
        <option value="">No lesson</option>
        {groups.map((group) => (
          <optgroup key={group.moduleId} label={group.moduleTitle}>
            {group.lessons.map((lesson) => (
              <option key={lesson.id} value={lesson.id}>
                {lesson.label}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
    </label>
  );
}
