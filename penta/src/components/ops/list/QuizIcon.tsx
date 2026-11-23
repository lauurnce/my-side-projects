import { panelsContent } from "@/content/landing";
import type { ActivityType } from "@/lib/quiz";

function Icon({ path }: { path: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" aria-hidden="true">
      <path d={path} />
    </svg>
  );
}

export function QuizIcon() {
  return <Icon path={panelsContent.ops.items[0].icon} />;
}

export function UploadIcon() {
  return <Icon path={panelsContent.ops.items[1].icon} />;
}

export function ActivityIcon({ type }: { type: ActivityType }) {
  return type === "upload" ? <UploadIcon /> : <QuizIcon />;
}
