import Link from "next/link";
import type { ReactNode } from "react";
import { BracketLabel } from "@/components/ui/BracketLabel";
import styles from "./StatePage.module.css";

export type StatePageProps = {
  label: string;
  title: string;
  children: ReactNode;
  href?: string;
  linkText?: string;
  onRetry?: () => void;
  alert?: boolean;
};

export function StatePage({ label, title, children, href, linkText, onRetry, alert }: StatePageProps) {
  return (
    <div className={styles.page} role={alert ? "alert" : undefined}>
      <p className={styles.label}>
        <BracketLabel>{label}</BracketLabel>
      </p>
      <h1 className={styles.title}>{title}</h1>
      <p className={styles.text}>{children}</p>
      <div className={styles.actions}>
        {onRetry && (
          <button type="button" className={styles.button} onClick={onRetry}>
            Try again
          </button>
        )}
        {href && linkText && (
          <Link prefetch={false} className={styles.button} href={href}>
            {linkText}
          </Link>
        )}
      </div>
    </div>
  );
}

export function LoadingPage() {
  return (
    <div className={styles.page} role="status" aria-live="polite">
      <p className={styles.label}>
        <BracketLabel>Loading</BracketLabel>
      </p>
      <p className={styles.loading}>Loading</p>
    </div>
  );
}

export function SectionNotFound() {
  return (
    <StatePage label="404" title="Not found" href="/hub" linkText="Back to the hub">
      This page does not exist, or it is no longer available to you.
    </StatePage>
  );
}

export function SectionError({ reset }: { reset: () => void }) {
  return (
    <StatePage label="Error" title="That did not work" href="/hub" linkText="Back to the hub" onRetry={reset} alert>
      PENTA could not finish that. Check your connection, then try again. Anything you typed and did not save may need to
      be typed again.
    </StatePage>
  );
}
