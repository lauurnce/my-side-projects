import { BracketLabel } from "@/components/ui/BracketLabel";
import { Grain } from "@/components/ui/Grain";
import { stackContent } from "@/content/landing";
import { LayerCounter } from "./LayerCounter";
import { StackPills } from "./StackPills";
import styles from "./StackScene.module.css";

const ghostSlots = [styles.ghost1, styles.ghost2, styles.ghost3];
const plates = [styles.plate1, styles.plate2, styles.plate3];

export function StackScene() {
  const { label, title, layers, goldTile, skip } = stackContent;
  return (
    <section id="stack" className={styles.stack} data-landing="stack" aria-labelledby="stack-title">
      <div className={styles.stage} data-landing="stage">
        <Grain />
        <span className={styles.label}>
          <BracketLabel>{label}</BracketLabel>
        </span>

        <div className={styles.left}>
          <h2 id="stack-title" className={styles.title}>
            {title.first}
            <br />
            {title.second}
          </h2>
          <StackPills />
        </div>

        <div className={styles.isoWrap} aria-hidden="true">
          <div className={styles.iso}>
            <div className={`${styles.slot} ${styles.shadow}`} />
            {ghostSlots.map((ghost) => (
              <div key={ghost} className={`${styles.slot} ${styles.ghost} ${ghost}`} />
            ))}
            {layers.map((layer, index) => (
              <div key={layer.index} className={`${styles.slot} ${plates[index]}`}>
                <div className={`${styles.sheet} ${styles.underInk}`} />
                <div className={`${styles.sheet} ${styles.underMid}`} />
                <div className={`${styles.sheet} ${styles.face}`}>
                  <div className={styles.faceHead}>
                    <span className={styles.faceName}>{layer.name}</span>
                    <span className={styles.faceIndex}>[ {layer.index} ]</span>
                  </div>
                  <div className={styles.tiles}>
                    {layer.tiles.map((tile) => (
                      <div
                        key={tile}
                        className={tile === goldTile ? `${styles.tile} ${styles.goldTile}` : styles.tile}
                      >
                        {tile}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className={styles.right}>
          <LayerCounter />
          <a href={skip.href} className={styles.skip}>
            {skip.label} <span aria-hidden="true">↓</span>
          </a>
        </div>
      </div>
    </section>
  );
}
