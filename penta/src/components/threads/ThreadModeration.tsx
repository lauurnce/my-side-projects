import type { ThreadInfo } from "@/lib/threads";

export type ThreadModerationProps = { thread: ThreadInfo; onChanged: () => void };

export function ThreadModeration({ thread }: ThreadModerationProps) {
  return <span data-thread={thread.id} />;
}
