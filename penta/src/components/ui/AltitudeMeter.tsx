import styles from "./AltitudeMeter.module.css";

export type AltitudeMeterProps = {
  meters: number;
  note?: string;
};

const summitMeters = 3000;

function markerTop(meters: number) {
  const ratio = meters / summitMeters;
  if (!Number.isFinite(ratio)) return 100;
  return Math.round((1 - Math.min(Math.max(ratio, 0), 1)) * 1000) / 10;
}

export function AltitudeMeter({ meters, note }: AltitudeMeterProps) {
  return (
    <div className={styles.meter}>
      <div className={styles.scale} aria-hidden="true">
        <span>3,000</span>
        <span>2,000</span>
        <span>1,000</span>
        <span>0 m</span>
        <span className={styles.marker} data-marker="" style={{ top: `${markerTop(meters)}%` }} />
      </div>
      <div className={styles.text}>
        <span className={styles.label}>Your altitude</span>
        <span className={styles.number}>
          {meters.toLocaleString("en-US")} m<span className="visually-hidden"> of 3,000 meters</span>
        </span>
        {note && <span className={styles.note}>{note}</span>}
      </div>
    </div>
  );
}
