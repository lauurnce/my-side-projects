import type { CurrentUser } from "@/lib/auth";

export function AppBar({ user }: { user: CurrentUser }) {
  return <header>{user.fullName}</header>;
}
