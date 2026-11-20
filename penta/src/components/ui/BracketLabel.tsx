import type { ReactNode } from "react";
import styles from "./BracketLabel.module.css";

export type BracketLabelProps = {
  children: ReactNode;
};

export function BracketLabel({ children }: BracketLabelProps) {
  return (
    <span className={styles.label}>
      <span aria-hidden="true">{"[ "}</span>
      {children}
      <span aria-hidden="true">{" ]"}</span>
    </span>
  );
}
