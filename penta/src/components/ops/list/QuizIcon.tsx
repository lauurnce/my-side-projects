import { panelsContent } from "@/content/landing";

export function QuizIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" aria-hidden="true">
      <path d={panelsContent.ops.items[0].icon} />
    </svg>
  );
}
