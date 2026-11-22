"use client";

import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import { answerFieldPrefix, kindFieldPrefix, type SubmitAction } from "@/app/ops/attempt-schema";
import { Field } from "@/components/ui/Field";
import { FilterPill } from "@/components/ui/FilterPill";
import { quizLimits } from "@/lib/config";
import { formatCountdown } from "@/lib/manila-time";
import type { AnswerValue, PaperQuestion } from "@/lib/quiz";
import { questionLegend, type SaveReply } from "./helpers";
import type { SaveStatus } from "./save-queue";
import styles from "./taking.module.css";
import { useAutosave } from "./useAutosave";
import { useCountdown } from "./useCountdown";

export type PaperFormProps = {
  action: SubmitAction;
  activityId: string;
  attemptId: string;
  questions: PaperQuestion[];
  answers: Record<string, AnswerValue>;
  expiresAt: string | null;
  now: string;
};

const saveLines: Record<SaveStatus, string> = {
  saved: "Saved",
  saving: "Saving",
  unsaved: "Not saved yet. Your answers are sent when you submit.",
};

function Choice({ name, kind, value, label, checked }: { name: string; kind: string; value: string; label: string; checked: boolean }) {
  return (
    <label className={styles.option}>
      <input type="radio" name={name} value={value} data-kind={kind} defaultChecked={checked} className={styles.radio} />
      <span className={styles.optionText} dir="auto">
        {label}
      </span>
    </label>
  );
}

function QuestionField({ question, number, saved }: { question: PaperQuestion; number: number; saved: AnswerValue }) {
  const name = `${answerFieldPrefix}${question.id}`;
  const promptId = `prompt-${question.id}`;

  return (
    <fieldset className={styles.question} aria-describedby={promptId}>
      <legend className={styles.legend}>{questionLegend(number, question.points)}</legend>
      <p id={promptId} className={styles.prompt} dir="auto">
        {question.prompt}
      </p>
      <input type="hidden" name={`${kindFieldPrefix}${question.id}`} value={question.kind} />
      {question.kind === "mcq" ? (
        <div className={styles.options}>
          {(question.options ?? []).map((option, index) => (
            <Choice key={index} name={name} kind="mcq" value={String(index)} label={option} checked={saved === index} />
          ))}
        </div>
      ) : null}
      {question.kind === "tf" ? (
        <div className={styles.options}>
          <Choice name={name} kind="tf" value="true" label="True" checked={saved === true} />
          <Choice name={name} kind="tf" value="false" label="False" checked={saved === false} />
        </div>
      ) : null}
      {question.kind === "ident" ? (
        <Field
          label="Your answer"
          name={name}
          type="text"
          data-kind="ident"
          maxLength={quizLimits.answerLength}
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          defaultValue={typeof saved === "string" ? saved : ""}
        />
      ) : null}
    </fieldset>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <FilterPill type="submit" disabled={pending} className={styles.submit}>
      Submit quiz
    </FilterPill>
  );
}

function keepEnterFromSubmitting(event: KeyboardEvent<HTMLFormElement>) {
  if (event.key === "Enter" && event.target instanceof HTMLInputElement && event.target.type === "text") {
    event.preventDefault();
  }
}

export function PaperForm({ action, activityId, attemptId, questions, answers, expiresAt, now }: PaperFormProps) {
  const router = useRouter();
  const form = useRef<HTMLFormElement>(null);
  const autoSubmitted = useRef(false);
  const [savedAnswers] = useState(answers);
  const [timeUp, setTimeUp] = useState(false);

  const submitOnce = useCallback(() => {
    if (autoSubmitted.current) return;
    autoSubmitted.current = true;
    setTimeUp(true);
    form.current?.requestSubmit();
  }, []);

  const { remaining, notice, sync } = useCountdown(now, expiresAt, submitOnce);
  const correctClock = useCallback((reply: SaveReply) => sync(reply.now, reply.expiresAt), [sync]);
  const { status, saveChange, saveBlur } = useAutosave(attemptId, correctClock);

  useEffect(() => {
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") router.refresh();
    };
    const refreshWhenRestored = (event: PageTransitionEvent) => {
      if (event.persisted) router.refresh();
    };
    document.addEventListener("visibilitychange", refreshWhenVisible);
    window.addEventListener("pageshow", refreshWhenRestored);
    return () => {
      document.removeEventListener("visibilitychange", refreshWhenVisible);
      window.removeEventListener("pageshow", refreshWhenRestored);
    };
  }, [router]);

  return (
    <form
      ref={form}
      action={action}
      className={styles.paper}
      onChange={saveChange}
      onBlur={saveBlur}
      onKeyDown={keepEnterFromSubmitting}
    >
      <input type="hidden" name="activityId" value={activityId} />
      <input type="hidden" name="attemptId" value={attemptId} />
      {remaining !== null ? (
        <p className={styles.clock} role="timer" aria-live="off">
          <span className={styles.clockLabel}>Time left</span>{" "}
          <span className={styles.clockTime}>{formatCountdown(remaining)}</span>
        </p>
      ) : null}
      {remaining === null && expiresAt === null ? (
        <p className={styles.noLimit}>No time limit. Submit when you are done.</p>
      ) : null}
      <p className="visually-hidden" aria-live="polite" data-timer-notice="">
        {notice}
      </p>
      <div className={styles.questions} inert={timeUp}>
        {questions.map((question, index) => (
          <QuestionField key={question.id} question={question} number={index + 1} saved={savedAnswers[question.id] ?? null} />
        ))}
      </div>
      <div className={styles.footer}>
        <p className={styles.saveLine} aria-live="polite" data-save-status="">
          {status ? saveLines[status] : ""}
        </p>
        <SubmitButton />
      </div>
    </form>
  );
}
