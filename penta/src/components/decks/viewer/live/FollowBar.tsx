import { StatusChip } from "@/components/ui/StatusChip";
import { panelsContent } from "@/content/landing";
import type { LiveLink } from "@/lib/live";
import styles from "./follow.module.css";

export type FollowBarProps = {
  running: boolean;
  following: boolean;
  joined: boolean;
  link: LiveLink;
  lastReadAt: number;
  liveSlide: number;
  onJoin: () => void;
  onBrowse: () => void;
};

const copy = panelsContent.decks.liveCard;

const clock = new Intl.DateTimeFormat("en-US", {
  timeZone: "Asia/Manila",
  hour: "numeric",
  minute: "2-digit",
  second: "2-digit",
  hour12: true,
});

function clockTime(milliseconds: number): string {
  return clock.format(milliseconds).replace(/\s/g, " ");
}

function linkSentence(link: LiveLink, lastReadAt: number): string | null {
  if (link === "catching_up") return "Reconnecting. You may be a few seconds behind.";
  if (link === "out_of_touch")
    return `No contact with the server since ${clockTime(lastReadAt)}. This slide may be out of date.`;
  return null;
}

function modeSentence(following: boolean, joined: boolean, liveSlide: number): string {
  if (following) return copy.text;
  if (joined) return `You are browsing on your own. The teacher is on slide ${liveSlide}.`;
  return `Your teacher is presenting this deck. Slide ${liveSlide} now.`;
}

export function FollowBar({
  running,
  following,
  joined,
  link,
  lastReadAt,
  liveSlide,
  onJoin,
  onBrowse,
}: FollowBarProps) {
  if (!running) return null;
  const trouble = following ? linkSentence(link, lastReadAt) : null;
  return (
    <section className={styles.bar} aria-label="Live session">
      <div className={styles.words}>
        <p className={styles.head}>
          <StatusChip status="live">Live</StatusChip>
          {following && <span className={styles.label}>{copy.label}</span>}
        </p>
        <p className={styles.line} role="status">
          <span>{modeSentence(following, joined, liveSlide)}</span>
          {trouble && <strong className={styles.trouble}>{trouble}</strong>}
        </p>
      </div>
      {following ? (
        <button type="button" className={styles.button} onClick={onBrowse}>
          {copy.action}
        </button>
      ) : (
        <button type="button" className={`${styles.button} ${styles.primary}`} onClick={onJoin}>
          {joined ? "Jump back" : "Join live"}
        </button>
      )}
    </section>
  );
}
