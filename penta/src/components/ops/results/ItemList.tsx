import type { QuestionKind } from "@/lib/quiz";
import { itemSentence, type ItemResult } from "@/lib/quiz-results";
import styles from "./results.module.css";

export type ItemListProps = { items: ItemResult[] };

const kindText: Record<QuestionKind, string> = {
  mcq: "Multiple choice",
  tf: "True or false",
  ident: "Identification",
};

function pointsText(points: number): string {
  return points === 1 ? "1 point" : `${points} points`;
}

export function ItemList({ items }: ItemListProps) {
  return (
    <ol className={styles.items}>
      {items.map((item) => (
        <li key={item.id} className={styles.item}>
          <p className={styles.itemMeta}>
            <span>Question {item.number}</span>
            <span>{kindText[item.kind]}</span>
            <span>{pointsText(item.points)}</span>
          </p>
          <details className={styles.promptBox}>
            <summary className={styles.promptSummary}>
              <span className={styles.prompt} dir="auto">
                {item.prompt}
              </span>
            </summary>
          </details>
          <p className={styles.itemCount}>{itemSentence(item)}</p>
          <span className={styles.track} aria-hidden="true">
            <span className={styles.fill} data-fill="" style={{ width: `${item.percent ?? 0}%` }} />
          </span>
        </li>
      ))}
    </ol>
  );
}
