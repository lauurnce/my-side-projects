import type { CurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { DeadlinesView } from "./deadlines/DeadlinesView";
import { loadDeadlines } from "./deadlines/load";

export type DeadlinesProps = { user: CurrentUser };

export async function Deadlines({ user }: DeadlinesProps) {
  const supabase = await createClient();
  const { groups, now } = await loadDeadlines(supabase, user.id);

  return <DeadlinesView groups={groups} now={now} />;
}
