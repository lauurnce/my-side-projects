import type { ReactNode } from "react";
import styles from "./Panels.module.css";

export function Panels({ children }: { children: ReactNode }) {
  return (
    <div className={styles.panels} data-landing="panels">
      {children}
    </div>
  );
}

type PanelProps = {
  id: string;
  cover?: 1 | 2;
  deep?: boolean;
  children: ReactNode;
};

export function Panel({ id, cover, deep, children }: PanelProps) {
  return (
    <section
      id={id}
      className={styles.panel}
      data-landing-panel={id}
      data-cover={cover}
      data-deep={deep ? "true" : undefined}
      aria-labelledby={`${id}-title`}
    >
      <div className={styles.inner}>{children}</div>
      {cover ? <div className={styles.dim} aria-hidden="true" /> : null}
    </section>
  );
}
