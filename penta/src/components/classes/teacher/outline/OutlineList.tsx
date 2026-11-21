import Link from "next/link";
import type { OutlineIntent, OutlineState } from "@/app/classes/routes-schema";
import { BracketLabel } from "@/components/ui/BracketLabel";
import { Field } from "@/components/ui/Field";
import { FilterPill } from "@/components/ui/FilterPill";
import { StatusChip } from "@/components/ui/StatusChip";
import { routeLimits } from "@/lib/config";
import type { ClassOutline, OutlineLesson, OutlineModule } from "@/lib/routes";
import teacherStyles from "../teacher.module.css";
import {
  lessonEditPath,
  lessonPath,
  minutesLabel,
  moduleNumber,
  moveLabel,
  outlineCountLabel,
  publishLabel,
  publishWord,
  statusWord,
} from "./labels";
import styles from "./outline.module.css";

type FormAction = (formData: FormData) => void;

type Controls = {
  formAction: FormAction;
  pending: boolean;
};

export type OutlineListProps = Controls & {
  outline: ClassOutline;
  state: OutlineState;
};

type ActionButtonProps = Controls & {
  intent: OutlineIntent;
  fields: Record<string, string>;
  name: string;
  disabled?: boolean;
  children: string;
};

function ActionButton({ formAction, pending, intent, fields, name, disabled = false, children }: ActionButtonProps) {
  return (
    <form action={formAction}>
      <input type="hidden" name="intent" value={intent} />
      {Object.entries(fields).map(([fieldName, value]) => (
        <input key={fieldName} type="hidden" name={fieldName} value={value} />
      ))}
      <button type="submit" className={styles.button} aria-label={name} disabled={disabled || pending}>
        {children}
      </button>
    </form>
  );
}

type Position = {
  first: boolean;
  last: boolean;
};

function LessonRow({
  lesson,
  classId,
  first,
  last,
  ...controls
}: Controls & Position & { lesson: OutlineLesson; classId: string }) {
  const target = { lessonId: lesson.id };

  return (
    <li className={styles.lesson}>
      <div className={styles.lessonInfo}>
        <Link className={styles.lessonTitle} href={lessonPath(classId, lesson.id)}>
          {lesson.title}
        </Link>
        <div className={styles.meta}>
          <StatusChip status={lesson.published ? "submitted" : "due"}>{statusWord(lesson.published)}</StatusChip>
          <span className={styles.minutes}>{minutesLabel(lesson.estMinutes)}</span>
        </div>
      </div>
      <div className={styles.actions}>
        <Link className={styles.button} href={lessonEditPath(classId, lesson.id)} aria-label={`Edit ${lesson.title}`}>
          Edit
        </Link>
        <ActionButton
          {...controls}
          intent="setLessonPublished"
          fields={{ ...target, published: String(!lesson.published) }}
          name={publishLabel(lesson.title, lesson.published)}
        >
          {publishWord(lesson.published)}
        </ActionButton>
        <ActionButton
          {...controls}
          intent="moveLesson"
          fields={{ ...target, direction: "up" }}
          name={moveLabel(lesson.title, "up")}
          disabled={first}
        >
          Move up
        </ActionButton>
        <ActionButton
          {...controls}
          intent="moveLesson"
          fields={{ ...target, direction: "down" }}
          name={moveLabel(lesson.title, "down")}
          disabled={last}
        >
          Move down
        </ActionButton>
        <ActionButton {...controls} intent="deleteLesson" fields={target} name={`Delete lesson ${lesson.title}`}>
          Delete
        </ActionButton>
      </div>
    </li>
  );
}

function ModuleBlock({
  moduleItem,
  index,
  first,
  last,
  ...controls
}: Controls & Position & { moduleItem: OutlineModule; index: number }) {
  const target = { moduleId: moduleItem.id };
  const { formAction, pending } = controls;

  return (
    <li className={styles.module}>
      <div className={styles.moduleHead}>
        <div className={styles.moduleName}>
          <span className={styles.moduleNumber}>{moduleNumber(index)}</span>
          <h3 className={styles.moduleTitle}>{moduleItem.title}</h3>
        </div>
        <div className={styles.actions}>
          <ActionButton
            {...controls}
            intent="moveModule"
            fields={{ ...target, direction: "up" }}
            name={moveLabel(moduleItem.title, "up")}
            disabled={first}
          >
            Move up
          </ActionButton>
          <ActionButton
            {...controls}
            intent="moveModule"
            fields={{ ...target, direction: "down" }}
            name={moveLabel(moduleItem.title, "down")}
            disabled={last}
          >
            Move down
          </ActionButton>
          <ActionButton {...controls} intent="deleteModule" fields={target} name={`Delete module ${moduleItem.title}`}>
            Delete module
          </ActionButton>
        </div>
      </div>
      <form action={formAction} className={styles.inlineForm}>
        <input type="hidden" name="intent" value="renameModule" />
        <input type="hidden" name="moduleId" value={moduleItem.id} />
        <div className={styles.inlineField}>
          <Field
            key={moduleItem.title}
            label="Module title"
            aria-label={`Module title for ${moduleItem.title}`}
            name="title"
            type="text"
            required
            maxLength={routeLimits.moduleTitleLength}
            autoComplete="off"
            defaultValue={moduleItem.title}
          />
        </div>
        <button
          type="submit"
          className={styles.button}
          aria-label={`Save title of ${moduleItem.title}`}
          disabled={pending}
        >
          Save
        </button>
      </form>
      {moduleItem.lessons.length === 0 ? (
        <p className={styles.emptyLessons}>No lessons in this module yet.</p>
      ) : (
        <ol className={styles.lessons} aria-label={`Lessons in ${moduleItem.title}`}>
          {moduleItem.lessons.map((lesson, lessonIndex) => (
            <LessonRow
              key={lesson.id}
              {...controls}
              lesson={lesson}
              classId={moduleItem.classId}
              first={lessonIndex === 0}
              last={lessonIndex === moduleItem.lessons.length - 1}
            />
          ))}
        </ol>
      )}
      <form action={formAction} className={styles.inlineForm}>
        <input type="hidden" name="intent" value="addLesson" />
        <input type="hidden" name="moduleId" value={moduleItem.id} />
        <div className={styles.inlineField}>
          <Field
            label="New lesson title"
            aria-label={`New lesson title in ${moduleItem.title}`}
            name="title"
            type="text"
            required
            maxLength={routeLimits.lessonTitleLength}
            autoComplete="off"
          />
        </div>
        <FilterPill
          type="submit"
          className={styles.primary}
          aria-label={`Add lesson to ${moduleItem.title}`}
          disabled={pending}
        >
          Add lesson
        </FilterPill>
      </form>
    </li>
  );
}

export function OutlineList({ outline, state, formAction, pending }: OutlineListProps) {
  const { modules } = outline;

  return (
    <section className={teacherStyles.section} aria-labelledby="outline-title">
      <div className={teacherStyles.sectionHead}>
        <h2 id="outline-title" className={teacherStyles.sectionTitle}>
          Modules and lessons
        </h2>
        <BracketLabel>{outlineCountLabel(outline)}</BracketLabel>
      </div>
      {state.message && (
        <p role={state.tone === "status" ? "status" : "alert"} className={teacherStyles.notice}>
          {state.message}
        </p>
      )}
      {modules.length === 0 ? (
        <p className={teacherStyles.empty}>No modules yet. Add the first module.</p>
      ) : (
        <ol className={styles.modules}>
          {modules.map((moduleItem, index) => (
            <ModuleBlock
              key={moduleItem.id}
              formAction={formAction}
              pending={pending}
              moduleItem={moduleItem}
              index={index}
              first={index === 0}
              last={index === modules.length - 1}
            />
          ))}
        </ol>
      )}
      <form action={formAction} className={`${styles.inlineForm} ${styles.addModule}`}>
        <input type="hidden" name="intent" value="addModule" />
        <input type="hidden" name="classId" value={outline.classId} />
        <div className={styles.inlineField}>
          <Field
            label="New module title"
            name="title"
            type="text"
            required
            maxLength={routeLimits.moduleTitleLength}
            autoComplete="off"
          />
        </div>
        <FilterPill type="submit" className={styles.primary} disabled={pending}>
          Add module
        </FilterPill>
      </form>
    </section>
  );
}
