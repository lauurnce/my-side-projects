import type { LiveLink } from "@/lib/live";

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

export function FollowBar({ running, following, joined, onJoin, onBrowse }: FollowBarProps) {
  if (!running) return null;
  return (
    <button type="button" onClick={following ? onBrowse : onJoin}>
      {following ? "Browse freely" : joined ? "Jump back" : "Join live"}
    </button>
  );
}
