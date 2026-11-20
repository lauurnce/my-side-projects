import type { ReactNode } from "react";
import styles from "./Barcode.module.css";

export type BarcodeProps = {
  caption?: ReactNode;
};

const barWidths = [2, 1, 3, 1, 1, 4, 2, 1, 2, 3, 1, 1, 2, 4, 1, 2, 1, 3, 2, 1, 1, 2, 3, 1];

export function Barcode({ caption }: BarcodeProps) {
  return (
    <div className={styles.barcode}>
      <span aria-hidden="true" className={styles.bars}>
        {barWidths.map((width, index) => (
          <span key={index} className={styles.bar} style={{ width: `${width}px` }} />
        ))}
      </span>
      {caption ? <span className={styles.caption}>{caption}</span> : null}
    </div>
  );
}
