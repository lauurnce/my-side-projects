import type { CurrentUser } from "@/lib/auth";

export type TeacherOutlineProps = {
  user: CurrentUser;
  classId: string;
};

export async function TeacherOutline({ classId }: TeacherOutlineProps) {
  return <section aria-label="Modules and lessons" data-class={classId} />;
}
