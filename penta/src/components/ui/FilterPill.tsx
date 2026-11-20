import type { ButtonHTMLAttributes } from "react";

export type FilterPillProps = ButtonHTMLAttributes<HTMLButtonElement>;

export function FilterPill({ children, ...button }: FilterPillProps) {
  return (
    <button type="button" {...button}>
      {children}
    </button>
  );
}
