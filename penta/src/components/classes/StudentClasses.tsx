import type { CurrentUser } from "@/lib/auth";

export async function StudentClasses({ user }: { user: CurrentUser }) {
  return <p>{user.fullName}</p>;
}
