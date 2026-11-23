import type { CurrentUser } from "@/lib/auth";
import { listStudentClasses } from "@/lib/classes";
import { loadAltitude } from "@/lib/grades";
import { createClient } from "@/lib/supabase/server";
import { AltitudeView } from "./altitude/AltitudeView";

export type AltitudePanelProps = { user: CurrentUser };

export async function AltitudePanel({ user }: AltitudePanelProps) {
  const supabase = await createClient();
  const [altitude, classes] = await Promise.all([
    loadAltitude(supabase, user.id),
    listStudentClasses(supabase, user.id),
  ]);

  return <AltitudeView altitude={altitude} classes={classes} />;
}
