import type { CurrentUser } from "@/lib/auth";

export type MyGradesProps = { user: CurrentUser };

export async function MyGrades({ user }: MyGradesProps) {
  return <section data-owner={user.id} />;
}
