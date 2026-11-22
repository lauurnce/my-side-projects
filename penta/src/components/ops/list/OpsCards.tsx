import { OpsCard } from "@/components/ui/OpsCard";
import { StatusChip } from "@/components/ui/StatusChip";
import { chipFor, detailLine, kindLine, opsHref, type OpsItem } from "./helpers";
import styles from "./list.module.css";
import { QuizIcon } from "./QuizIcon";

export type OpsCardsProps = {
  items: OpsItem[];
  codeFor: (item: OpsItem) => string;
  compact?: boolean;
};

export function OpsCards({ items, codeFor, compact }: OpsCardsProps) {
  return (
    <ul className={compact ? `${styles.grid} ${styles.compact}` : styles.grid}>
      {items.map((item) => {
        const chip = chipFor(item);
        return (
          <li key={item.activity.id} className={styles.cell}>
            <OpsCard
              href={opsHref(item.activity.id)}
              icon={<QuizIcon />}
              kind={kindLine(codeFor(item))}
              title={item.activity.title}
              detail={detailLine(item.activity)}
              status={<StatusChip status={chip.status}>{chip.text}</StatusChip>}
            />
          </li>
        );
      })}
    </ul>
  );
}
