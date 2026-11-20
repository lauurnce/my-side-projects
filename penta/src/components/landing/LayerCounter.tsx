"use client";

import { BracketLabel } from "@/components/ui/BracketLabel";
import { stackContent } from "@/content/landing";
import type { Layer } from "@/lib/scroll-math";
import { useActiveLayer } from "./ScrollStage";
import styles from "./LayerCounter.module.css";

const layerNumbers: Layer[] = [1, 2, 3];

export function LayerCounter() {
  const active = useActiveLayer();
  const { index, name } = stackContent.layers[active - 1];
  const { label, total } = stackContent.counter;

  return (
    <div className={styles.counter} aria-hidden="true">
      <BracketLabel>{label}</BracketLabel>
      <span className={styles.number}>{index}</span>
      <span className={styles.name}>
        / {total} · {name}
      </span>
      <div className={styles.ticks}>
        {layerNumbers.map((layer) => (
          <span key={layer} className={layer <= active ? `${styles.tick} ${styles.reached}` : styles.tick} />
        ))}
      </div>
    </div>
  );
}
