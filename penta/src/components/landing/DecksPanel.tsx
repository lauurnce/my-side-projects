import { BracketLabel } from "@/components/ui/BracketLabel";
import { OctagonCTA } from "@/components/ui/OctagonCTA";
import { panelsContent } from "@/content/landing";
import styles from "./DecksPanel.module.css";
import { Panel } from "./Panels";
import panel from "./Panels.module.css";

const { decks, sampleLabel } = panelsContent;

const thumbNumbers = Array.from({ length: decks.thumbCount }, (_, index) => index + 1);

function thumbClass(number: number) {
  if (number === decks.currentThumb) return `${styles.thumb} ${styles.current}`;
  if (number < decks.currentThumb) return `${styles.thumb} ${styles.viewed}`;
  return styles.thumb;
}

function thumbState(number: number) {
  if (number === decks.currentThumb) return "current";
  return number < decks.currentThumb ? "viewed" : "idle";
}

function FlowArrow() {
  return (
    <svg className={styles.flowArrow} width="28" height="14" viewBox="0 0 28 14" aria-hidden="true">
      <path d="M0 7 H26 M20 1 L26 7 L20 13" fill="none" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

function SlideArrow({ path }: { path: string }) {
  return (
    <span className={styles.slideArrow}>
      <svg width="16" height="16" viewBox="0 0 24 24">
        <path d={path} fill="none" stroke="currentColor" strokeWidth="1.8" />
      </svg>
    </span>
  );
}

export function DecksPanel() {
  const [producer, broker, consumer] = decks.slide.boxes;
  const viewedPercent = Math.round((decks.unlock.viewed / decks.unlock.total) * 100);
  return (
    <Panel id="decks" cover={2} deep>
      <div className={panel.head}>
        <h2 id="decks-title" className={panel.title}>
          {decks.title}
        </h2>
        <div className={panel.labels}>
          {decks.labels.map((label) => (
            <BracketLabel key={label}>{label}</BracketLabel>
          ))}
          <BracketLabel>{sampleLabel}</BracketLabel>
        </div>
        <span className={styles.live}>
          <span className={styles.liveDot} aria-hidden="true" />
          {decks.live}
        </span>
      </div>

      <div className={styles.grid}>
        <div className={styles.viewer}>
          <div className={styles.meta}>
            <span>{decks.lesson}</span>
            <span>{decks.position}</span>
          </div>
          <div className={styles.stage}>
            <div className={styles.slide}>
              <span className={styles.slideLabel}>{decks.slide.label}</span>
              <div className={styles.flow}>
                <div className={styles.box}>{producer}</div>
                <FlowArrow />
                <div className={`${styles.box} ${styles.boxOn}`}>{broker}</div>
                <FlowArrow />
                <div className={styles.box}>{consumer}</div>
              </div>
              <span className={styles.sentence}>{decks.slide.sentence}</span>
            </div>
          </div>
          <div className={styles.strip} aria-hidden="true">
            <SlideArrow path="M15 6 L9 12 L15 18" />
            <div className={styles.thumbs}>
              {thumbNumbers.map((number) => (
                <span key={number} className={thumbClass(number)} data-thumb={thumbState(number)} />
              ))}
            </div>
            <SlideArrow path="M9 6 L15 12 L9 18" />
          </div>
        </div>

        <div className={styles.side}>
          <div className={styles.liveCard}>
            <span className={styles.liveHead}>
              <span className={styles.liveMark} aria-hidden="true" />
              {decks.liveCard.label}
            </span>
            <span className={styles.liveText}>{decks.liveCard.text}</span>
            <span className={styles.browse} aria-hidden="true">
              {decks.liveCard.action}
            </span>
          </div>
          <div className={styles.unlock}>
            <span className={styles.unlockLabel}>{decks.unlock.label}</span>
            <span className={styles.unlockTitle}>{decks.unlock.title}</span>
            <span className={styles.track} aria-hidden="true">
              <span className={styles.fill} style={{ width: `${viewedPercent}%` }} />
            </span>
            <span className={styles.unlockCount}>
              Viewed {decks.unlock.viewed} / {decks.unlock.total}
            </span>
          </div>
          <div className={styles.cta}>
            <OctagonCTA {...decks.cta} size={96} />
          </div>
        </div>
      </div>
    </Panel>
  );
}
