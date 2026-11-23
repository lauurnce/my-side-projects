import { OpsCard } from "@/components/ui/OpsCard";
import { StatusChip } from "@/components/ui/StatusChip";
import { chipsFor, detailLine, kindLine, opsHref, type OpsItem } from "./helpers";
import styles from "./list.module.css";
import { ActivityIcon } from "./QuizIcon";

export type OpsCardsProps = {
  items: OpsItem[];
  codeFor: (item: OpsItem) => string;
  compact?: boolean;
};

export function OpsCards({ items, codeFor, compact }: OpsCardsProps) {
  return (
    <ul className={compact ? `${styles.grid} ${styles.compact}` : styles.grid}>
      {items.map((item) => (
        <li key={item.activity.id} className={styles.cell}>
          <OpsCard
            href={opsHref(item.activity.id)}
            icon={<ActivityIcon type={item.activity.type} />}
            kind={kindLine(codeFor(item), item.activity.type)}
            title={item.activity.title}
            detail={detailLine(item.activity)}
            status={
              <span className={styles.chips}>
                {chipsFor(item).map((chip) => (
                  <StatusChip key={chip.status} status={chip.status}>
                    {chip.text}
                  </StatusChip>
                ))}
              </span>
            }
          />
        </li>
      ))}
    </ul>
  );
}
