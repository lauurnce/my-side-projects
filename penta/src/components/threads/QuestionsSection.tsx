import type { CurrentUser } from "@/lib/auth";
import type { ThreadTarget } from "@/lib/threads";

export type QuestionsSectionProps = { user: CurrentUser; classId: string; target: ThreadTarget };

export async function QuestionsSection({ classId }: QuestionsSectionProps) {
  return <section data-class={classId} />;
}
