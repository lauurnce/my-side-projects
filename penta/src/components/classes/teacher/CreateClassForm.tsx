"use client";

import { useActionState, useId } from "react";
import { createClass } from "@/app/classes/teacher-actions";
import type { CreateClassField, CreateClassState } from "@/app/classes/teacher-schema";
import { Field } from "@/components/ui/Field";
import { FilterPill } from "@/components/ui/FilterPill";
import styles from "./teacher.module.css";

type FieldSpec = {
  name: CreateClassField;
  label: string;
  hint: string;
  maxLength: number;
  required: boolean;
};

const fields: FieldSpec[] = [
  { name: "code", label: "Course code", hint: "For example COMP 018", maxLength: 20, required: true },
  { name: "title", label: "Title", hint: "The course name, up to 120 characters", maxLength: 120, required: true },
  { name: "section", label: "Section (optional)", hint: "For example BSIT 3-3", maxLength: 40, required: false },
  { name: "term", label: "Term (optional)", hint: "For example 1st Sem AY 2026-27", maxLength: 40, required: false },
];

const initialState: CreateClassState = {};

export function CreateClassForm() {
  const [state, formAction, pending] = useActionState(createClass, initialState);
  const hintPrefix = useId();

  return (
    <form action={formAction} className={styles.form}>
      {fields.map((field) => (
        <div key={field.name} className={styles.formField}>
          <Field
            label={field.label}
            name={field.name}
            type="text"
            required={field.required}
            maxLength={field.maxLength}
            autoComplete="off"
            defaultValue={state.values?.[field.name] ?? ""}
            error={state.fieldErrors?.[field.name]}
            aria-describedby={`${hintPrefix}-${field.name}`}
          />
          <span id={`${hintPrefix}-${field.name}`} className={styles.hint}>
            {field.hint}
          </span>
        </div>
      ))}
      {state.message && (
        <p role="alert" className={styles.formMessage}>
          {state.message}
        </p>
      )}
      <FilterPill type="submit" disabled={pending} className={styles.submit}>
        {pending ? "Creating" : "Create class"}
      </FilterPill>
    </form>
  );
}
