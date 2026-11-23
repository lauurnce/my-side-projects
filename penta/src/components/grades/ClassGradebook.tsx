import type { CurrentUser } from "@/lib/auth";

export type ClassGradebookProps = { user: CurrentUser; classId: string };

export async function ClassGradebook({ classId }: ClassGradebookProps) {
  return <h1 data-class={classId}>Gradebook</h1>;
}
