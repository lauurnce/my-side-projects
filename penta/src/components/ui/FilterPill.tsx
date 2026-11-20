import type { ButtonHTMLAttributes } from "react";
import styles from "./FilterPill.module.css";

export type FilterPillProps = ButtonHTMLAttributes<HTMLButtonElement>;

export function FilterPill({ children, className, ...button }: FilterPillProps) {
  return (
    <button type="button" {...button} className={className ? `${styles.pill} ${className}` : styles.pill}>
      {children}
    </button>
  );
}
