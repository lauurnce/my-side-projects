import Link from "next/link";
import { BracketLabel } from "@/components/ui/BracketLabel";
import styles from "./student.module.css";

export type ClassDetailProps = {
  code: string;
  section: string;
  term: string;
  title: string;
  teacherName: string;
  joinedOn: string | null;
};

const comingLater = [
  { layer: "Layer 01", name: "Lessons", text: "Nothing here yet. Lessons arrive in a later update." },
  { layer: "Layer 02", name: "Decks", text: "Nothing here yet. Decks arrive in a later update." },
  { layer: "Layer 03", name: "Activities", text: "Nothing here yet. Activities arrive in a later update." },
];

export function ClassDetail({ code, section, term, title, teacherName, joinedOn }: ClassDetailProps) {
  return (
    <div className={styles.page}>
      <Link className={styles.back} href="/classes">
        Back to your classes
      </Link>
      <header className={styles.header}>
        <p className={styles.labels}>
          <span>{code}</span>
          {section ? <BracketLabel>{section}</BracketLabel> : null}
          {term ? <span>{term}</span> : null}
        </p>
        <h1 className={styles.heading}>{title}</h1>
        <dl className={styles.facts}>
          <div>
            <dt>Teacher</dt>
            <dd>{teacherName}</dd>
          </div>
          {joinedOn ? (
            <div>
              <dt>Enrollment</dt>
              <dd>Joined on {joinedOn}</dd>
            </div>
          ) : null}
        </dl>
      </header>
      <div className={styles.grid}>
        {comingLater.map((later) => (
          <section key={later.name} className={styles.later}>
            <span className={styles.laterLabel}>
              <span aria-hidden="true">[ </span>
              {later.layer}
              <span aria-hidden="true"> ]</span>
            </span>
            <h2 className={styles.laterTitle}>{later.name}</h2>
            <p className={styles.laterText}>{later.text}</p>
          </section>
        ))}
      </div>
    </div>
  );
}
