import type { CurrentUser } from "@/lib/auth";

export async function TeacherClasses({ user }: { user: CurrentUser }) {
  return <p>{user.fullName}</p>;
}
