import type { CurrentUser } from "@/lib/auth";

export type DeadlinesProps = { user: CurrentUser };

export async function Deadlines({ user }: DeadlinesProps) {
  return <section data-owner={user.id} />;
}
