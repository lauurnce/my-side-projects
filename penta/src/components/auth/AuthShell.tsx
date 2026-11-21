import Link from "next/link";
import type { ReactNode } from "react";
import { BracketLabel } from "@/components/ui/BracketLabel";
import { Grain } from "@/components/ui/Grain";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import styles from "./AuthShell.module.css";

export type AuthShellProps = {
  title: string;
  labels: string[];
  lead: string;
  children: ReactNode;
};

export function AuthShell({ title, labels, lead, children }: AuthShellProps) {
  return (
    <div className={styles.shell}>
      <Grain />
      <header className={styles.bar}>
        <Link href="/" aria-label="Penta, home" className={`spray-tag ${styles.brand}`}>
          Penta
        </Link>
        <ThemeToggle />
      </header>
      <main id="main" className={styles.main}>
        <div className={styles.intro}>
          <p className={styles.labels}>
            {labels.map((label) => (
              <BracketLabel key={label}>{label}</BracketLabel>
            ))}
          </p>
          <h1 className={styles.title}>{title}</h1>
          <p className={styles.lead}>{lead}</p>
        </div>
        <div className={styles.panel}>{children}</div>
      </main>
    </div>
  );
}
