import type { ThreadPost } from "@/lib/threads";

export type PostModerationProps = { post: ThreadPost; onChanged: () => void };

export function PostModeration({ post }: PostModerationProps) {
  return <span data-post={post.id} />;
}
