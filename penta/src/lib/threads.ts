import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

type Supabase = SupabaseClient<Database>;
type SummaryRow = Database["public"]["Functions"]["class_threads"]["Returns"][number];

export type AuthorRole = "teacher" | "student";

export type ThreadSummary = {
  id: string;
  lessonId: string | null;
  activityId: string | null;
  targetTitle: string;
  title: string;
  authorName: string;
  authorRole: AuthorRole;
  createdAt: string;
  locked: boolean;
  replies: number;
  lastPostAt: string | null;
  hiddenPosts: number;
  questionHidden: boolean;
};

export type ThreadInfo = {
  id: string;
  classId: string;
  lessonId: string | null;
  activityId: string | null;
  targetTitle: string;
  title: string;
  locked: boolean;
  canModerate: boolean;
};

export type ThreadPost = {
  id: string;
  parentId: string | null;
  isQuestion: boolean;
  authorName: string;
  authorRole: AuthorRole;
  mine: boolean;
  canEdit: boolean;
  body: string;
  createdAt: string;
  editedAt: string | null;
  hidden: boolean;
  authorId: string | null;
  authorInClass: boolean;
  editCount: number;
};

export type OpenThread = { status: "ok"; version: number; thread: ThreadInfo; posts: ThreadPost[] };

export type ThreadView = { status: "not_found" } | { status: "unchanged"; version: number } | OpenThread;

export type PostGroup = { post: ThreadPost; replies: ThreadPost[] };

export type ThreadTarget = { lessonId: string } | { activityId: string };

type Fields = Record<string, unknown>;

function fieldsOf(value: unknown): Fields | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Fields) : null;
}

function textOf(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function idOrNull(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function roleOf(value: unknown): AuthorRole {
  return value === "teacher" ? "teacher" : "student";
}

export function toThreadSummary(row: SummaryRow): ThreadSummary {
  return {
    id: row.thread_id,
    lessonId: row.lesson_id,
    activityId: row.activity_id,
    targetTitle: row.target_title ?? "",
    title: row.title,
    authorName: row.author_name,
    authorRole: roleOf(row.author_role),
    createdAt: row.created_at,
    locked: row.locked,
    replies: row.replies,
    lastPostAt: row.last_post_at,
    hiddenPosts: row.hidden_posts,
    questionHidden: row.question_hidden,
  };
}

function toThreadPost(value: unknown): ThreadPost | null {
  const fields = fieldsOf(value);
  if (!fields || typeof fields.id !== "string" || typeof fields.body !== "string") return null;
  return {
    id: fields.id,
    parentId: idOrNull(fields.parent_id),
    isQuestion: fields.is_question === true,
    authorName: textOf(fields.author_name),
    authorRole: roleOf(fields.author_role),
    mine: fields.mine === true,
    canEdit: fields.can_edit === true,
    body: fields.body,
    createdAt: textOf(fields.created_at),
    editedAt: idOrNull(fields.edited_at),
    hidden: fields.hidden === true,
    authorId: idOrNull(fields.author_id),
    authorInClass: fields.author_in_class !== false,
    editCount: typeof fields.edit_count === "number" ? fields.edit_count : 0,
  };
}

function toThreadInfo(value: unknown): ThreadInfo | null {
  const fields = fieldsOf(value);
  if (!fields || typeof fields.id !== "string" || typeof fields.class_id !== "string") return null;
  return {
    id: fields.id,
    classId: fields.class_id,
    lessonId: idOrNull(fields.lesson_id),
    activityId: idOrNull(fields.activity_id),
    targetTitle: textOf(fields.target_title),
    title: textOf(fields.title),
    locked: fields.locked === true,
    canModerate: fields.can_moderate === true,
  };
}

export function toThreadView(value: unknown): ThreadView | null {
  const fields = fieldsOf(value);
  if (!fields) return null;
  if (fields.status === "not_found") return { status: "not_found" };
  if (typeof fields.version !== "number") return null;
  if (fields.status === "unchanged") return { status: "unchanged", version: fields.version };

  const thread = toThreadInfo(fields.thread);
  if (fields.status !== "ok" || !thread || !Array.isArray(fields.posts)) return null;
  return {
    status: "ok",
    version: fields.version,
    thread,
    posts: fields.posts.map(toThreadPost).filter((post): post is ThreadPost => post !== null),
  };
}

export function threadsFor(threads: ThreadSummary[], target: ThreadTarget): ThreadSummary[] {
  return threads.filter((thread) =>
    "lessonId" in target ? thread.lessonId === target.lessonId : thread.activityId === target.activityId,
  );
}

export function groupPosts(posts: ThreadPost[]): PostGroup[] {
  const topLevel = posts.filter((post) => post.parentId === null);
  const ordered = [...topLevel.filter((post) => post.isQuestion), ...topLevel.filter((post) => !post.isQuestion)];
  return ordered.map((post) => ({ post, replies: posts.filter((reply) => reply.parentId === post.id) }));
}

export function threadTargetHref(thread: Pick<ThreadInfo, "classId" | "lessonId" | "activityId">): string {
  if (thread.lessonId) return `/classes/${thread.classId}/lessons/${thread.lessonId}`;
  return thread.activityId ? `/ops/${thread.activityId}` : `/classes/${thread.classId}`;
}

export function countCharacters(value: string): number {
  return Array.from(value.normalize("NFC").replace(/\r\n?/g, "\n").trim()).length;
}

export async function loadClassThreads(supabase: Supabase, classId: string): Promise<ThreadSummary[]> {
  const { data } = await supabase.rpc("class_threads", { target_class: classId });
  return (data ?? []).map(toThreadSummary);
}

export async function loadThreadView(
  supabase: Supabase,
  threadId: string,
  knownVersion?: number,
): Promise<ThreadView | null> {
  const { data, error } = await supabase.rpc("thread_view", {
    target_thread: threadId,
    known_version: knownVersion,
  });
  return error ? null : toThreadView(data);
}
