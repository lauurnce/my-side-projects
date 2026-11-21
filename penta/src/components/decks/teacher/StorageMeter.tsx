import { usageLevel, type StorageUsage } from "@/lib/decks";
import styles from "./decks.module.css";
import { meterMessages, percentSentence, reservedSentence, storageSentence, takenPercent } from "./labels";

export function StorageMeter({ usage }: { usage: StorageUsage | null }) {
  if (!usage) return <p className={styles.note}>{meterMessages.unknown}</p>;

  const level = usageLevel(usage);
  const reserved = reservedSentence(usage);

  return (
    <div className={styles.meter} data-level={level}>
      <p className={styles.meterText}>{storageSentence(usage)}</p>
      <div className={styles.track} aria-hidden="true">
        <div className={styles.fill} style={{ width: `${takenPercent(usage)}%` }} />
      </div>
      <p className={styles.meterDetail}>
        <span>{percentSentence(usage)}</span>
        {reserved && <span>{reserved}</span>}
      </p>
      {level !== "ok" && <p className={styles.warning}>{meterMessages.nearlyFull}</p>}
    </div>
  );
}
