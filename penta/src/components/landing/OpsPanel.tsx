import { BracketLabel } from "@/components/ui/BracketLabel";
import { OctagonCTA } from "@/components/ui/OctagonCTA";
import { StatusChip } from "@/components/ui/StatusChip";
import { panelsContent } from "@/content/landing";
import styles from "./OpsPanel.module.css";
import { Panel } from "./Panels";
import panel from "./Panels.module.css";

const { ops, sampleLabel, filters } = panelsContent;

export function OpsPanel() {
  return (
    <Panel id="ops">
      <h2 id="ops-title" className="visually-hidden">
        {ops.title}
      </h2>
      <div className={styles.top}>
        <p className={styles.line}>
          {ops.line} <span className={styles.soft}>{ops.lineSoft}</span>
        </p>
        <OctagonCTA {...ops.cta} size={96} />
      </div>

      <div className={styles.bar}>
        <h3 className={styles.inventory}>{ops.inventory}</h3>
        <span className={styles.labels}>
          {ops.labels.map((label) => (
            <BracketLabel key={label}>{label}</BracketLabel>
          ))}
          <BracketLabel>{sampleLabel}</BracketLabel>
        </span>
        <span className={panel.filters}>{filters}</span>
      </div>

      <div className={styles.grid}>
        {ops.items.map((item) => (
          <div key={item.title} className={styles.item}>
            <div className={styles.tile}>
              <svg width="64" height="64" viewBox="0 0 24 24" aria-hidden="true">
                <path d={item.icon} fill="none" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round" />
              </svg>
            </div>
            <div className={styles.text}>
              <span className={styles.muted}>{item.kind}</span>
              <span>{item.title}</span>
              <span className={styles.muted}>{item.meta}</span>
            </div>
            <span className={styles.chip}>
              <StatusChip status={item.status}>{item.statusText}</StatusChip>
            </span>
          </div>
        ))}
      </div>
    </Panel>
  );
}
