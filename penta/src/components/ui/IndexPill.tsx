"use client";

import { useId } from "react";
import styles from "./IndexPill.module.css";

export type IndexPillProps = {
  index: string;
  name: string;
  sub?: string;
  description: string;
  active: boolean;
  onSelect: () => void;
};

export function IndexPill({ index, name, sub, description, active, onSelect }: IndexPillProps) {
  const descriptionId = useId();
  return (
    <div className={active ? `${styles.pill} ${styles.active}` : styles.pill}>
      <button
        type="button"
        className={styles.button}
        aria-current={active ? "true" : undefined}
        aria-describedby={descriptionId}
        onClick={onSelect}
      >
        <span className={styles.index}>{index}</span>{" "}
        <span className={styles.name}>{name}</span>
        {sub ? <> <span className={styles.sub}>{sub}</span></> : null}
        <span className={styles.mark} aria-hidden="true">
          {active ? "−" : "+"}
        </span>
      </button>
      <p id={descriptionId} className={styles.description}>
        {description}
      </p>
    </div>
  );
}
