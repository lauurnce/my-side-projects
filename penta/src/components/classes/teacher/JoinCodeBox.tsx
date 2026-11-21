import { formatJoinCode } from "@/lib/join-code";
import styles from "./teacher.module.css";

export function JoinCodeBox({ code }: { code: string | null }) {
  return (
    <section className={styles.joinBox} aria-labelledby="join-code-label">
      <h2 id="join-code-label" className={styles.joinLabel}>
        Join code
      </h2>
      <p className={styles.joinCode}>{code ? formatJoinCode(code) : "Unavailable"}</p>
      <p className={styles.joinNote}>
        Students enter this code on their Classes page. It changes when you remove a student.
      </p>
    </section>
  );
}
