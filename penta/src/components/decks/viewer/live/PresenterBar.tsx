import type { LiveLink } from "@/lib/live";
import { StatusChip } from "@/components/ui/StatusChip";
import { connectionSentence, followerSentence } from "./presenter-text";
import styles from "./presenter.module.css";

export type PresenterBarProps = {
  presenting: boolean;
  busy: boolean;
  ready: boolean;
  followers: number | null;
  link: LiveLink;
  unsent: boolean;
  lastReadAt: number;
  problem?: string | null;
  onPresent: () => void;
  onEnd: () => void;
};

export function PresenterBar(props: PresenterBarProps) {
  const { presenting, busy, ready, followers, link, unsent, lastReadAt, problem, onPresent, onEnd } = props;

  if (!presenting) {
    return (
      <div className={styles.bar}>
        <button type="button" className={styles.present} disabled={busy || !ready} onClick={onPresent}>
          Present
        </button>
        <p className={styles.help}>Students who join see the slide you are on.</p>
      </div>
    );
  }

  const connection = connectionSentence(link, lastReadAt);

  return (
    <div className={styles.bar}>
      <StatusChip status="live">Live</StatusChip>
      <div role="status" className={styles.status}>
        <p className={styles.followers}>{followerSentence(followers)}</p>
        {connection && <p className={styles.notice}>{connection}</p>}
        {unsent && !problem && <p className={styles.notice}>Slide not sent, retrying</p>}
      </div>
      {problem && (
        <p role="alert" className={styles.notice}>
          {problem}
        </p>
      )}
      <button type="button" className={styles.end} disabled={busy} onClick={onEnd}>
        End session
      </button>
    </div>
  );
}
