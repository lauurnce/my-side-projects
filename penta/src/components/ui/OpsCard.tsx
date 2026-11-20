import type { ReactNode } from "react";
import styles from "./OpsCard.module.css";

export type OpsCardProps = {
  href?: string;
  icon: ReactNode;
  kind: string;
  title: string;
  detail: string;
  status: ReactNode;
};

export function OpsCard({ href, icon, kind, title, detail, status }: OpsCardProps) {
  const card = (
    <>
      <span className={styles.tile}>{icon}</span>
      <span className={styles.text}>
        <span className={styles.kind}>{kind}</span>
        <span className={styles.title}>{title}</span>
        <span className={styles.detail}>{detail}</span>
        <span className={styles.status}>{status}</span>
      </span>
    </>
  );
  if (!href) return <div className={styles.link}>{card}</div>;
  return (
    <a className={styles.link} href={href}>
      {card}
    </a>
  );
}
