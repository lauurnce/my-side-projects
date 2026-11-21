import { BracketLabel } from "@/components/ui/BracketLabel";
import styles from "./student.module.css";

export function classCountLabel(count: number) {
  return count === 1 ? "1 class" : `${count} classes`;
}

export function ClassesHeader({ count }: { count: number }) {
  return (
    <header className={styles.header}>
      <BracketLabel>{classCountLabel(count)}</BracketLabel>
      <h1 className={styles.heading}>Your classes</h1>
    </header>
  );
}
