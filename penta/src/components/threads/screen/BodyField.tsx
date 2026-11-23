"use client";

import { useId } from "react";
import { characterCountLabel, formattingHelp } from "./helpers";
import styles from "./screen.module.css";

export type BodyFieldProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  rows?: number;
  invalid?: boolean;
  describedBy?: string;
  autoFocus?: boolean;
};

export function BodyField({ label, value, onChange, rows = 5, invalid, describedBy, autoFocus }: BodyFieldProps) {
  const id = useId();
  const description = [`${id}-count`, `${id}-help`, describedBy].filter(Boolean).join(" ");

  return (
    <div className={styles.field}>
      <label htmlFor={`${id}-body`} className={styles.fieldLabel}>
        {label}
      </label>
      <textarea
        id={`${id}-body`}
        name="body"
        className={styles.textarea}
        rows={rows}
        required
        dir="auto"
        autoFocus={autoFocus}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-describedby={description}
        aria-invalid={invalid ? "true" : undefined}
      />
      <span id={`${id}-count`} className={styles.count}>
        {characterCountLabel(value)}
      </span>
      <span id={`${id}-help`} className={styles.help}>
        {formattingHelp}
      </span>
    </div>
  );
}
