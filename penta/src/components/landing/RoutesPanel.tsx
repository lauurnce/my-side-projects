import { BracketLabel } from "@/components/ui/BracketLabel";
import { Grain } from "@/components/ui/Grain";
import { RouteCard } from "@/components/ui/RouteCard";
import { SprayTag } from "@/components/ui/SprayTag";
import { panelsContent } from "@/content/landing";
import { Panel } from "./Panels";
import panel from "./Panels.module.css";
import styles from "./RoutesPanel.module.css";

const { routes, sampleLabel, filters } = panelsContent;

export function RoutesPanel() {
  return (
    <Panel id="routes" cover={1}>
      <div className={panel.head}>
        <h2 id="routes-title" className={panel.title}>
          {routes.title}
        </h2>
        <div className={panel.labels}>
          {routes.labels.map((label) => (
            <BracketLabel key={label}>{label}</BracketLabel>
          ))}
          <BracketLabel>{sampleLabel}</BracketLabel>
        </div>
        <div className={panel.list}>
          {routes.list.map((item) => (
            <span key={item}>{item}</span>
          ))}
        </div>
        <span className={panel.filters}>{filters}</span>
      </div>

      <div className={styles.grid}>
        <div className={styles.feature}>
          <div className={`building-image ${styles.building}`} aria-hidden="true" />
          <Grain />
          <SprayTag className={styles.tag}>{routes.feature.tag}</SprayTag>
          <div className={styles.scrim} aria-hidden="true" />
          <div className={styles.featureText}>
            <BracketLabel>{routes.feature.label}</BracketLabel>
            <span className={styles.featureCode}>{routes.feature.code}</span>
            <span className={styles.featureName}>{routes.feature.name}</span>
          </div>
          <div className={styles.resume}>
            <span className={styles.octagon} aria-hidden="true">
              <svg className={styles.outline} width="72" height="72" viewBox="0 0 100 100">
                <polygon points="30,2 70,2 98,30 98,70 70,98 30,98 2,70 2,30" stroke="currentColor" strokeWidth="1.6" />
              </svg>
              <svg width="22" height="22" viewBox="0 0 24 24">
                <path d="M7 17 L17 7 M9 7 H17 V15" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="square" />
              </svg>
            </span>
            <div className={styles.resumeText}>
              <span>{routes.feature.resume}</span>
              <span className={styles.muted}>{routes.feature.lesson}</span>
            </div>
          </div>
        </div>
        {routes.cards.map((card) => (
          <div key={card.code} className={styles.cell}>
            <RouteCard {...card} />
          </div>
        ))}
      </div>

      <div className={styles.altitude}>
        <span className={styles.muted}>{routes.altitude.start}</span>
        <div className={styles.line}>
          <span className={styles.marker} aria-hidden="true" />
          <span className={styles.you}>{routes.altitude.you}</span>
        </div>
        <span className={styles.muted}>{routes.altitude.summit}</span>
      </div>
    </Panel>
  );
}
