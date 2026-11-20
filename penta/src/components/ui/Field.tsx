import { useId } from "react";
import type { InputHTMLAttributes } from "react";
import styles from "./Field.module.css";

export type FieldProps = InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  error?: string;
};

function errorText(error: string) {
  return error.startsWith("Error: ") ? error : `Error: ${error}`;
}

export function Field({ label, error, className, ...input }: FieldProps) {
  const errorId = useId();
  const inputClass = [styles.input, className].filter(Boolean).join(" ");

  if (!error) {
    return (
      <label className={styles.field}>
        <span className={styles.label}>{label}</span>
        <input {...input} className={inputClass} />
      </label>
    );
  }

  return (
    <label className={styles.field}>
      <span className={styles.label}>{label}</span>
      <input {...input} className={inputClass} aria-invalid="true" aria-describedby={errorId} />
      <span id={errorId} className={styles.error}>
        {errorText(error)}
      </span>
    </label>
  );
}
