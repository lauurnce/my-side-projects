import { ClassCard, type ClassCardProps } from "./ClassCard";
import styles from "./student.module.css";

export function ClassList({ classes }: { classes: ClassCardProps[] }) {
  if (classes.length === 0) {
    return <p className={styles.empty}>No classes yet. Enter a join code from your teacher.</p>;
  }

  return (
    <ul className={styles.grid}>
      {classes.map((enrolledClass) => (
        <li key={enrolledClass.id} className={styles.cell}>
          <ClassCard {...enrolledClass} />
        </li>
      ))}
    </ul>
  );
}
