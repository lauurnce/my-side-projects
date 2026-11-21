"use client";

import { useSearchParams } from "next/navigation";
import styles from "./teacher.module.css";

export function RemovalNotice() {
  const outcome = useSearchParams().get("removed");

  if (outcome === "yes") {
    return (
      <p role="status" className={styles.notice}>
        Student removed. The join code changed.
      </p>
    );
  }
  if (outcome === "no") {
    return (
      <p role="alert" className={styles.notice}>
        Could not remove the student
      </p>
    );
  }
  return null;
}
