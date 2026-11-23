import type { CurrentUser } from "@/lib/auth";

export type AltitudePanelProps = { user: CurrentUser };

export async function AltitudePanel({ user }: AltitudePanelProps) {
  return <section data-owner={user.id} />;
}
