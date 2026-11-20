"use client";

import { IndexPill } from "@/components/ui/IndexPill";
import { stackContent } from "@/content/landing";
import type { Layer } from "@/lib/scroll-math";
import { useActiveLayer, useGoToLayer } from "./ScrollStage";
import styles from "./StackPills.module.css";

const layerNumbers: Layer[] = [1, 2, 3];

export function StackPills() {
  const active = useActiveLayer();
  const goToLayer = useGoToLayer();

  return (
    <div className={styles.pills}>
      {layerNumbers.map((layer) => {
        const { index, name, sub, description } = stackContent.layers[layer - 1];
        return (
          <IndexPill
            key={index}
            index={index}
            name={name}
            sub={sub}
            description={description}
            active={layer === active}
            onSelect={() => goToLayer(layer)}
          />
        );
      })}
    </div>
  );
}
