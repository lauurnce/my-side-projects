"use client";

import { useActionState, useState } from "react";
import {
  questionValues,
  type BuilderIntent,
  type QuizActionState,
  type SaveQuestionState,
} from "@/app/ops/builder-schema";
import outlineStyles from "@/components/classes/teacher/outline/outline.module.css";
import teacherStyles from "@/components/classes/teacher/teacher.module.css";
import { BracketLabel } from "@/components/ui/BracketLabel";
import { FilterPill } from "@/components/ui/FilterPill";
import type { TeacherQuestion } from "@/lib/quiz";
import { builderNotes, questionCountLabel, questionNumber } from "./labels";
import { QuestionCard } from "./QuestionCard";
import { QuestionForm } from "./QuestionForm";
import { RekeyForm, type RekeyAction } from "./RekeyForm";
import styles from "./builder.module.css";

export type SaveQuestionAction = (previousState: SaveQuestionState, formData: FormData) => Promise<SaveQuestionState>;

export type BuilderAction = (previousState: QuizActionState, formData: FormData) => Promise<QuizActionState>;

export type QuestionBoardProps = {
  activityId: string;
  questions: TeacherQuestion[];
  published: boolean;
  saveAction: SaveQuestionAction;
  listAction: BuilderAction;
  rekeyAction: RekeyAction;
};

type FormAction = (formData: FormData) => void;

type ListButtonProps = {
  formAction: FormAction;
  intent: BuilderIntent;
  fields: Record<string, string>;
  name: string;
  disabled: boolean;
  children: string;
};

const initialSaveState: SaveQuestionState = {};
const initialListState: QuizActionState = {};
const noState: SaveQuestionState = {};

function ListButton({ formAction, intent, fields, name, disabled, children }: ListButtonProps) {
  return (
    <form action={formAction}>
      <input type="hidden" name="intent" value={intent} />
      {Object.entries(fields).map(([fieldName, value]) => (
        <input key={fieldName} type="hidden" name={fieldName} value={value} />
      ))}
      <button type="submit" className={outlineStyles.button} aria-label={name} disabled={disabled}>
        {children}
      </button>
    </form>
  );
}

export function QuestionBoard({
  activityId,
  questions,
  published,
  saveAction,
  listAction,
  rekeyAction,
}: QuestionBoardProps) {
  const [saveState, saveFormAction, savePending] = useActionState(saveAction, initialSaveState);
  const [listState, listFormAction, listPending] = useActionState(listAction, initialListState);
  const [form, setForm] = useState({
    editingId: null as string | null,
    openCount: 0,
    resetCount: 0,
    seen: initialSaveState,
    dismissed: initialSaveState,
  });

  if (saveState !== form.seen) {
    const closesEdit = saveState.tone === "status" && form.editingId !== null;
    setForm({
      ...form,
      seen: saveState,
      resetCount: form.resetCount + 1,
      editingId: closesEdit ? null : form.editingId,
      openCount: closesEdit ? form.openCount + 1 : form.openCount,
    });
  }

  function open(editingId: string | null) {
    setForm({ ...form, editingId, openCount: form.openCount + 1, dismissed: saveState });
  }

  const editingIndex = questions.findIndex((question) => question.id === form.editingId);
  const editing = editingIndex >= 0 ? questions[editingIndex] : null;
  const liveState = saveState === form.dismissed ? noState : saveState;

  return (
    <section className={teacherStyles.section}>
      <div className={teacherStyles.sectionHead}>
        <h2 className={teacherStyles.sectionTitle}>Questions</h2>
        <BracketLabel>{questionCountLabel(questions.length)}</BracketLabel>
      </div>
      {published && <p className={teacherStyles.notice}>{builderNotes.published}</p>}
      {listState.message && (
        <p role={listState.tone === "status" ? "status" : "alert"} className={teacherStyles.notice}>
          {listState.message}
        </p>
      )}
      {questions.length === 0 ? (
        <p className={teacherStyles.empty}>{builderNotes.noQuestions}</p>
      ) : (
        <ol className={styles.questions}>
          {questions.map((question, index) => {
            const number = index + 1;
            const target = { questionId: question.id };
            return (
              <li key={question.id} className={styles.question}>
                <QuestionCard question={question} index={index} />
                {published ? (
                  <RekeyForm question={question} index={index} action={rekeyAction} />
                ) : (
                  <div className={outlineStyles.actions}>
                    <button
                      type="button"
                      className={outlineStyles.button}
                      aria-label={`Edit item ${number}`}
                      aria-pressed={form.editingId === question.id}
                      onClick={() => open(question.id)}
                    >
                      Edit
                    </button>
                    <ListButton
                      formAction={listFormAction}
                      intent="moveQuestion"
                      fields={{ ...target, direction: "up" }}
                      name={`Move item ${number} up`}
                      disabled={listPending || index === 0}
                    >
                      Move up
                    </ListButton>
                    <ListButton
                      formAction={listFormAction}
                      intent="moveQuestion"
                      fields={{ ...target, direction: "down" }}
                      name={`Move item ${number} down`}
                      disabled={listPending || index === questions.length - 1}
                    >
                      Move down
                    </ListButton>
                    <ListButton
                      formAction={listFormAction}
                      intent="deleteQuestion"
                      fields={target}
                      name={`Delete item ${number}`}
                      disabled={listPending}
                    >
                      Delete
                    </ListButton>
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      )}
      {!published && (
        <div className={styles.editor}>
          <FilterPill className={styles.submit} onClick={() => open(null)}>
            Add question
          </FilterPill>
          <QuestionForm
            key={`${editing?.id ?? "new"}-${form.openCount}`}
            activityId={activityId}
            questionId={editing?.id ?? null}
            heading={editing ? `Edit ${questionNumber(editingIndex).toLowerCase()}` : "New question"}
            values={liveState.values ?? questionValues(editing)}
            state={liveState}
            resetCount={form.resetCount}
            focusOnMount={form.openCount > 0}
            formAction={saveFormAction}
            pending={savePending}
          />
        </div>
      )}
    </section>
  );
}
