import type { OpenThread } from "@/lib/threads";

export type ThreadLink = "live" | "catching_up";

export type ThreadLive = {
  view: OpenThread | null;
  link: ThreadLink;
  refresh: () => Promise<void>;
};

export function useThreadLive(initial: OpenThread): ThreadLive {
  return { view: initial, link: "catching_up", refresh: async () => undefined };
}
