import styles from "./DeckThumb.module.css";

export type DeckFormat = "PDF" | "PPTX" | "SLIDES";

export type DeckThumbProps = {
  href?: string;
  eyebrow: string;
  title: string;
  slideCount: number;
  format: DeckFormat;
  viewedCount: number;
  live?: boolean;
};

export function DeckThumb({ href, eyebrow, title, slideCount, format, viewedCount, live }: DeckThumbProps) {
  const card = (
    <>
      <span className={styles.slide}>
        <span className={styles.eyebrow}>{eyebrow}</span>
        <span className={styles.title}>{title}</span>
        {live ? <span className={styles.live}>LIVE</span> : null}
      </span>
      <span className={styles.meta}>
        <span>
          {slideCount} slides · {format}
        </span>
        <span>
          Viewed {viewedCount} / {slideCount}
        </span>
      </span>
    </>
  );
  if (!href) return <div className={styles.link}>{card}</div>;
  return (
    <a href={href} className={styles.link}>
      {card}
    </a>
  );
}
