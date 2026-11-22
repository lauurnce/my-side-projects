import { useId } from "react";
import type { ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";
import { Field, type FieldProps } from "@/components/ui/Field";
import styles from "./builder.module.css";

type Notes = {
  label: string;
  hint?: string;
  error?: string;
};

function noteIds(id: string, hint?: string, error?: string): string | undefined {
  const ids = [hint ? `${id}-hint` : "", error ? `${id}-error` : ""].filter(Boolean);
  return ids.length > 0 ? ids.join(" ") : undefined;
}

function FieldNotes({ id, hint, error }: { id: string; hint?: string; error?: string }) {
  return (
    <>
      {hint && (
        <span id={`${id}-hint`} className={styles.hint}>
          {hint}
        </span>
      )}
      {error && (
        <span id={`${id}-error`} className={styles.error}>
          {`Error: ${error}`}
        </span>
      )}
    </>
  );
}

export function NotedField({ hint, ...field }: FieldProps & { hint: string }) {
  const id = useId();

  return (
    <div className={styles.field}>
      <Field {...field} aria-describedby={id} />
      <span id={id} className={styles.hint}>
        {hint}
      </span>
    </div>
  );
}

export function SelectField({
  label,
  hint,
  error,
  children,
  ...select
}: SelectHTMLAttributes<HTMLSelectElement> & Notes & { children: ReactNode }) {
  const id = useId();

  return (
    <div className={styles.field}>
      <label htmlFor={id} className={styles.label}>
        {label}
      </label>
      <select
        {...select}
        id={id}
        className={styles.select}
        aria-describedby={noteIds(id, hint, error)}
        aria-invalid={error ? "true" : undefined}
      >
        {children}
      </select>
      <FieldNotes id={id} hint={hint} error={error} />
    </div>
  );
}

export function TextAreaField({
  label,
  hint,
  error,
  ...textarea
}: TextareaHTMLAttributes<HTMLTextAreaElement> & Notes) {
  const id = useId();

  return (
    <div className={styles.field}>
      <label htmlFor={id} className={styles.label}>
        {label}
      </label>
      <textarea
        {...textarea}
        id={id}
        className={styles.textarea}
        dir="auto"
        aria-describedby={noteIds(id, hint, error)}
        aria-invalid={error ? "true" : undefined}
      />
      <FieldNotes id={id} hint={hint} error={error} />
    </div>
  );
}
