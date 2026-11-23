import type { Metadata } from "next";
import { AppBar } from "@/components/app/AppBar";
import { HubHero, HubLayers } from "@/components/hub/Hub";
import { ScrollStage } from "@/components/landing/ScrollStage";
import { loadOpsData } from "@/components/ops/list/load";
import { requireUser } from "@/lib/auth";
import { loadDecks } from "@/lib/decks";
import { loadAltitude, noAltitude } from "@/lib/grades";
import { loadLiveDecks } from "@/lib/live";
import { loadActivities } from "@/lib/quiz";
import { listStudentClasses, listTeacherClasses, withProgress } from "@/lib/classes";
import { loadOutlines } from "@/lib/routes";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Hub · PENTA" };

export default async function HubPage() {
  const user = await requireUser();
  const supabase = await createClient();
  const [listed, outlines, decks, live, activities, altitude] = await Promise.all([
    user.role === "teacher" ? listTeacherClasses(supabase, user.id) : listStudentClasses(supabase, user.id),
    loadOutlines(supabase, user.id),
    loadDecks(supabase),
    loadLiveDecks(supabase),
    loadActivities(supabase),
    user.role === "student" ? loadAltitude(supabase, user.id) : noAltitude,
  ]);
  const ops = await loadOpsData(supabase, activities, user.role === "student" ? user.id : null);
  const classes = withProgress<{ id: string; code: string; title: string; section: string }>(listed, outlines);

  return (
    <ScrollStage>
      <AppBar user={user} />
      <main id="main">
        <HubHero role={user.role} classes={classes} altitude={altitude} decks={decks} live={live} ops={ops} />
        <HubLayers role={user.role} classes={classes} altitude={altitude} decks={decks} live={live} ops={ops} />
      </main>
    </ScrollStage>
  );
}
