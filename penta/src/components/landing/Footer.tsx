import { Barcode } from "@/components/ui/Barcode";
import { Grain } from "@/components/ui/Grain";
import { SprayTag } from "@/components/ui/SprayTag";
import { footerContent } from "@/content/landing";
import styles from "./Footer.module.css";

export function Footer() {
  const [firstCaptionLine, secondCaptionLine] = footerContent.caption;
  return (
    <footer className={styles.footer}>
      <SprayTag className={styles.tag}>{footerContent.tag}</SprayTag>
      <div className={`building-image ${styles.building}`} aria-hidden="true" />
      <div className={styles.scrim} aria-hidden="true" />
      <Grain />
      <div className={`${styles.side} ${styles.origin}`}>
        <span>{footerContent.origin}</span>
        <span className={styles.protocol}>{footerContent.protocol}</span>
      </div>
      <div className={`${styles.side} ${styles.motto}`}>{footerContent.motto}</div>
      <div className={styles.bottom}>
        <h2 className={styles.headline}>
          {footerContent.headline.map((line) => (
            <span key={line} className={styles.line}>
              {line}
            </span>
          ))}
        </h2>
        <div className={styles.actions}>
          <a href={footerContent.login.href} className={styles.login}>
            {footerContent.login.label}
          </a>
          <Barcode
            caption={
              <>
                {firstCaptionLine}
                <br />
                {secondCaptionLine}
              </>
            }
          />
        </div>
      </div>
    </footer>
  );
}
