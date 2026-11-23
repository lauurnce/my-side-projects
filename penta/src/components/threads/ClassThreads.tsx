import type { CurrentUser } from "@/lib/auth";

export type ClassThreadsProps = { user: CurrentUser; classId: string };

export async function ClassThreads({ classId }: ClassThreadsProps) {
  return <section data-class={classId} />;
}
