import type { ReactNode } from "react";
import styles from "./StatusChip.module.css";

export type Status = "due" | "late" | "submitted" | "graded" | "live";

export type StatusChipProps = {
  status: Status;
  dot?: boolean;
  children: ReactNode;
};

export function StatusChip({ status, dot = true, children }: StatusChipProps) {
  return (
    <span className={`${styles.chip} ${styles[status]}`} data-status={status}>
      {dot && <span className={styles.dot} data-dot="" aria-hidden="true" />}
      {children}
    </span>
  );
}
