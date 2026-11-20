import Link from "next/link";
import { BracketLabel } from "@/components/ui/BracketLabel";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { heroContent } from "@/content/landing";
import styles from "./TopBar.module.css";

export function TopBar() {
  const { brand, meta, login } = heroContent;
  return (
    <header className={styles.bar}>
      <Link href={brand.href} aria-label={brand.name} className={`spray-tag ${styles.brand}`}>
        {brand.tag}
      </Link>
      <div className={styles.meta}>
        {meta.map((label) => (
          <BracketLabel key={label}>{label}</BracketLabel>
        ))}
      </div>
      <div className={styles.actions}>
        <ThemeToggle />
        <Link href={login.href} prefetch={false} className={styles.login}>
          {login.label}
        </Link>
      </div>
    </header>
  );
}
