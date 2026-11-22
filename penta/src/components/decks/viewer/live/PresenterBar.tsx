import type { LiveLink } from "@/lib/live";

export type PresenterBarProps = {
  presenting: boolean;
  busy: boolean;
  ready: boolean;
  followers: number | null;
  link: LiveLink;
  unsent: boolean;
  lastReadAt: number;
  onPresent: () => void;
  onEnd: () => void;
};

export function PresenterBar({ presenting, busy, ready, onPresent, onEnd }: PresenterBarProps) {
  return (
    <button type="button" disabled={busy || !ready} onClick={presenting ? onEnd : onPresent}>
      {presenting ? "End session" : "Present"}
    </button>
  );
}
