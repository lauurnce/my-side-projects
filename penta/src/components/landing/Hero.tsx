import { BracketLabel } from "@/components/ui/BracketLabel";
import { Grain } from "@/components/ui/Grain";
import { OctagonCTA } from "@/components/ui/OctagonCTA";
import { SprayTag } from "@/components/ui/SprayTag";
import { heroContent } from "@/content/landing";
import styles from "./Hero.module.css";

export function Hero() {
  const { labels, headline, rows, cta, deckCard, opsCard, counter, scroll, tag } = heroContent;
  return (
    <section className={styles.hero} data-landing="hero">
      <SprayTag className={styles.tag}>{tag}</SprayTag>
      <div aria-hidden="true" className={`building-image ${styles.building}`} />
      <div aria-hidden="true" className={styles.fade} />
      <div className={styles.grain}>
        <Grain />
      </div>

      <div className={styles.grid}>
        <div className={styles.main}>
          <p className={styles.labels}>
            {labels.map((label) => (
              <BracketLabel key={label}>{label}</BracketLabel>
            ))}
          </p>
          <h1 className={styles.headline}>
            <span className={styles.line}>{headline.first}</span>{" "}
            <span className={styles.line}>
              {headline.second}
              <sup className={styles.mark}>{headline.mark}</sup>
            </span>
          </h1>
          <div className={styles.rows}>
            {rows.map((row) => (
              <p key={row.name} className={styles.row}>
                <span className={styles.rowName}>{row.name}</span>
                {row.values.map((value, index) => (
                  <span key={value} className={index === row.marked ? styles.marked : undefined}>
                    {value}
                  </span>
                ))}
              </p>
            ))}
          </div>
          <OctagonCTA href={cta.href} eyebrow={cta.eyebrow} title={cta.title} size={124} />
        </div>

        <div aria-hidden="true" className={styles.side}>
          <div className={styles.cards}>
            <div className={`clip-card ${styles.card}`}>
              <span className={styles.cardLabel}>{deckCard.layer}</span>
              <div className={styles.slide}>
                <span className={styles.slideTitle}>{deckCard.title}</span>
                <span className={styles.chip}>{deckCard.chip}</span>
              </div>
              <span className={styles.cardLabel}>{deckCard.foot}</span>
            </div>
            <div className={`clip-card ${styles.card}`}>
              <span className={styles.cardLabel}>{opsCard.layer}</span>
              <div className={styles.options}>
                <div className={styles.option} />
                <div className={styles.optionPicked} />
                <div className={styles.option} />
              </div>
              <span className={styles.cardLabel}>{opsCard.foot}</span>
            </div>
          </div>
          <div className={styles.counter}>
            <span>{counter.from}</span>
            <span className={styles.counterLine} />
            <span>{counter.to}</span>
          </div>
        </div>
      </div>

      <a href={scroll.href} className={styles.scroll}>
        <span>{scroll.label}</span>
        <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M6 9 L12 15 L18 9" fill="none" stroke="currentColor" strokeWidth="1.6" />
        </svg>
      </a>
    </section>
  );
}
