import Link from "next/link";
import { BracketLabel } from "@/components/ui/BracketLabel";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import type { CurrentUser } from "@/lib/auth";
import styles from "./AppBar.module.css";
import { SignOutButton } from "./SignOutButton";

export function AppBar({ user }: { user: CurrentUser }) {
  return (
    <header className={styles.bar}>
      <a href="#main" className="skip-link">
        Skip to the page
      </a>
      <Link href="/hub" aria-label="Penta, hub" className={`spray-tag ${styles.brand}`}>
        Penta
      </Link>
      <Link href="/classes" className={styles.link}>
        Classes
      </Link>
      {user.role === "student" ? (
        <Link href="/grades" className={styles.link}>
          Grades
        </Link>
      ) : null}
      <p className={styles.identity}>
        <span className={styles.name}>{user.fullName}</span>
        <BracketLabel>{user.role}</BracketLabel>
      </p>
      <div className={styles.actions}>
        <ThemeToggle />
        <SignOutButton />
      </div>
    </header>
  );
}
