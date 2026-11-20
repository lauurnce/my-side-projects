import styles from "./OctagonCTA.module.css";

export type OctagonSize = 124 | 96 | 72;

export type OctagonCTAProps = {
  href: string;
  eyebrow: string;
  title: string;
  size?: OctagonSize;
};

const drawings: Record<OctagonSize, { box: string; outline: number; arrow: number; arrowStroke: number }> = {
  124: { box: styles.size124, outline: 1.2, arrow: 30, arrowStroke: 1.6 },
  96: { box: styles.size96, outline: 1.3, arrow: 26, arrowStroke: 1.7 },
  72: { box: styles.size72, outline: 1.6, arrow: 22, arrowStroke: 1.8 },
};

export function OctagonCTA({ href, eyebrow, title, size = 124 }: OctagonCTAProps) {
  const drawing = drawings[size];
  return (
    <a href={href} className={styles.link}>
      <span className={`${styles.box} ${drawing.box}`}>
        <svg className={styles.outline} width={size} height={size} viewBox="0 0 100 100" aria-hidden="true">
          <polygon
            className={styles.octagon}
            points="30,2 70,2 98,30 98,70 70,98 30,98 2,70 2,30"
            stroke="currentColor"
            strokeWidth={drawing.outline}
          />
        </svg>
        <svg width={drawing.arrow} height={drawing.arrow} viewBox="0 0 24 24" aria-hidden="true">
          <path
            className={styles.arrow}
            d="M7 17 L17 7 M9 7 H17 V15"
            fill="none"
            stroke="currentColor"
            strokeWidth={drawing.arrowStroke}
            strokeLinecap="square"
          />
        </svg>
      </span>
      <span className={styles.text}>
        <span className={styles.eyebrow}>{eyebrow}</span>{" "}
        <span className={styles.title}>{title}</span>
      </span>
    </a>
  );
}
