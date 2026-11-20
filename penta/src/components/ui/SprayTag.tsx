import type { ReactNode } from "react";
import styles from "./SprayTag.module.css";

export type SprayTagProps = {
  children: ReactNode;
  className?: string;
};

export function SprayTag({ children, className }: SprayTagProps) {
  return (
    <span aria-hidden="true" className={[styles.tag, className].filter(Boolean).join(" ")}>
      {children}
    </span>
  );
}
