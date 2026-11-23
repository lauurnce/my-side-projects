import { z } from "zod";
import { threadLimits } from "@/lib/config";
import { countCharacters } from "@/lib/threads";

const bodyMaxText = threadLimits.bodyLength.toLocaleString("en-US");

export const threadMessages = {
  failed: "Something went wrong. Try again.",
  notFound: "This is not available.",
  badTitle: `Give your question a title of ${threadLimits.titleLength} characters or fewer.`,
  badBody: `Your text was not accepted. Keep it under ${bodyMaxText} characters and ${threadLimits.bodyLines} lines, and remove hidden characters or deeply nested lists.`,
  badName: "Your display name matches your teacher's name. Change your name before posting.",
  slowDown: "You are posting too fast. Wait a minute and try again.",
  limitReached: "You have reached the posting limit for now. Try again later.",
  targetFull: "This lesson or activity already has the most questions it can hold.",
  askedEnough: "You have asked the most questions one person can ask here.",
  threadFull: "This thread is full.",
  locked: "This thread is locked.",
  badParent: "You can only reply to a top-level post.",
  posted: "Posted",
  edited: "Saved",
  unchanged: "Nothing changed.",
  tooLate: `Posts can be edited for ${threadLimits.editMinutes} minutes.`,
  tooManyEdits: `A post can be edited ${threadLimits.editsPerPost} times.`,
  emptyTitle: "Enter a title for your question.",
  emptyBody: "Write something before posting.",
  longBody: `Use ${bodyMaxText} characters or fewer.`,
} as const;

export type ThreadField = "title" | "body";

export type ThreadFormValues = { title?: string; body: string };

export type ThreadFormState = {
  tone?: "status" | "alert";
  message?: string;
  field?: ThreadField;
  values?: ThreadFormValues;
};

export type ThreadFormAction = (previousState: ThreadFormState, formData: FormData) => Promise<ThreadFormState>;

const lineBreak = /\r\n?/g;

export function unixLines(text: string): string {
  return text.replace(lineBreak, "\n");
}

export function textOf(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

export function idOf(formData: FormData, name: string): string | null {
  return textOf(formData, name) || null;
}

const titleSchema = z
  .string(threadMessages.emptyTitle)
  .trim()
  .refine((value) => countCharacters(value) >= 1, threadMessages.emptyTitle)
  .refine((value) => countCharacters(value) <= threadLimits.titleLength, threadMessages.badTitle);

const bodySchema = z
  .string(threadMessages.emptyBody)
  .transform(unixLines)
  .refine((value) => countCharacters(value) >= 1, threadMessages.emptyBody)
  .refine((value) => countCharacters(value) <= threadLimits.bodyLength, threadMessages.longBody);

const optionalId = z.uuid().nullable();

export const askQuestionSchema = z
  .object({
    classId: z.uuid(),
    lessonId: optionalId,
    activityId: optionalId,
    title: titleSchema,
    body: bodySchema,
  })
  .refine((question) => (question.lessonId === null) !== (question.activityId === null), { path: ["target"] });

export const addPostSchema = z.object({ threadId: z.uuid(), parentId: optionalId, body: bodySchema });

export const editPostSchema = z.object({ postId: z.uuid(), body: bodySchema });

function alertState(message: string, values: ThreadFormValues, field?: ThreadField): ThreadFormState {
  return { tone: "alert", message, field, values };
}

export function invalidState(error: z.ZodError, values: ThreadFormValues): ThreadFormState {
  for (const field of ["title", "body"] as const) {
    const issue = error.issues.find(({ path }) => path[0] === field);
    if (issue) return alertState(issue.message, values, field);
  }
  return alertState(threadMessages.notFound, values);
}

export function statusOf(result: unknown): string {
  if (typeof result !== "object" || result === null) return "unknown";
  const { status } = result as Record<string, unknown>;
  return typeof status === "string" ? status : "unknown";
}

export function askedThreadId(result: unknown): string | null {
  if (statusOf(result) !== "asked") return null;
  const { thread_id: threadId } = result as Record<string, unknown>;
  return typeof threadId === "string" && z.uuid().safeParse(threadId).success ? threadId : null;
}

const sharedRefusals: Record<string, string> = {
  not_found: threadMessages.notFound,
  bad_body: threadMessages.badBody,
  bad_name: threadMessages.badName,
  slow_down: threadMessages.slowDown,
  limit_reached: threadMessages.limitReached,
  locked: threadMessages.locked,
};

const askRefusals: Record<string, string> = {
  ...sharedRefusals,
  bad_title: threadMessages.badTitle,
  full: threadMessages.targetFull,
  asked_enough: threadMessages.askedEnough,
};

const postRefusals: Record<string, string> = {
  ...sharedRefusals,
  bad_parent: threadMessages.badParent,
  full: threadMessages.threadFull,
};

const editRefusals: Record<string, string> = {
  not_found: threadMessages.notFound,
  bad_body: threadMessages.badBody,
  locked: threadMessages.locked,
  unchanged: threadMessages.unchanged,
  too_late: threadMessages.tooLate,
  too_many_edits: threadMessages.tooManyEdits,
};

const fieldByStatus: Record<string, ThreadField> = { bad_title: "title", bad_body: "body" };

function refusedState(refusals: Record<string, string>, status: string, values: ThreadFormValues): ThreadFormState {
  return alertState(refusals[status] ?? threadMessages.failed, values, fieldByStatus[status]);
}

export function askRefusedState(result: unknown, values: ThreadFormValues): ThreadFormState {
  return refusedState(askRefusals, statusOf(result), values);
}

export function addPostState(result: unknown, values: ThreadFormValues): ThreadFormState {
  const status = statusOf(result);
  if (status === "posted") return { tone: "status", message: threadMessages.posted };
  return refusedState(postRefusals, status, values);
}

export function editPostState(result: unknown, values: ThreadFormValues): ThreadFormState {
  const status = statusOf(result);
  if (status === "edited") return { tone: "status", message: threadMessages.edited };
  return refusedState(editRefusals, status, values);
}
