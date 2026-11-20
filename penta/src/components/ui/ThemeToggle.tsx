"use client";

import { switchTheme } from "@/lib/theme";
import styles from "./ThemeToggle.module.css";

export function ThemeToggle() {
  return (
    <button type="button" className={styles.toggle} onClick={() => switchTheme(document.documentElement, document)}>
      <span className={`only-light ${styles.pair}`}>
        <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
          <path
            d="M20 14.5 A8.5 8.5 0 1 1 9.5 4 A6.6 6.6 0 0 0 20 14.5 Z"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinejoin="round"
          />
        </svg>
        <span className="visually-hidden">Switch to </span>
        dark
        <span className="visually-hidden"> theme</span>
      </span>
      <span className={`only-dark ${styles.pair}`}>
        <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="12" r="4.2" fill="none" stroke="currentColor" strokeWidth="1.7" />
          <path
            d="M12 2.5 V5 M12 19 V21.5 M2.5 12 H5 M19 12 H21.5 M5.3 5.3 L7 7 M17 17 L18.7 18.7 M5.3 18.7 L7 17 M17 7 L18.7 5.3"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
          />
        </svg>
        <span className="visually-hidden">Switch to </span>
        light
        <span className="visually-hidden"> theme</span>
      </span>
    </button>
  );
}
