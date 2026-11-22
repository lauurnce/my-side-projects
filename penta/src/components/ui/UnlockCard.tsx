import styles from "./UnlockCard.module.css";

export type UnlockCardProps = {
  title: string;
  viewed: number;
  total: number;
  href?: string;
};

export function UnlockCard({ title, viewed, total, href }: UnlockCardProps) {
  const slides = Math.max(0, total);
  const seen = Math.min(Math.max(0, viewed), slides);
  const unlocked = slides > 0 && seen === slides;
  const percent = slides > 0 ? Math.round((seen / slides) * 100) : 0;
  const card = (
    <span className={styles.card}>
      <span className={styles.label}>{unlocked ? "Unlocked" : "Finish this deck to unlock"}</span>
      <span className={styles.title}>{title}</span>
      <span className={styles.track} aria-hidden="true">
        <span className={styles.fill} data-fill="" style={{ width: `${percent}%` }} />
      </span>
      <span className={styles.count}>
        Viewed {seen} / {slides}
        {unlocked ? ". Every slide seen." : null}
      </span>
    </span>
  );
  if (!href) return <div className={styles.block}>{card}</div>;
  return (
    <a href={href} className={styles.link}>
      {card}
    </a>
  );
}
