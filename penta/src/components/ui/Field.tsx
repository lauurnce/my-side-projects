import type { InputHTMLAttributes } from "react";

export type FieldProps = InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  error?: string;
};

export function Field({ label, error, ...input }: FieldProps) {
  return (
    <label>
      {label}
      <input {...input} aria-invalid={Boolean(error)} />
    </label>
  );
}
