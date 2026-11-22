import type { Metadata } from "next";
import { AppBar } from "@/components/app/AppBar";
import { HubHero, HubLayers } from "@/components/hub/Hub";
import { ScrollStage } from "@/components/landing/ScrollStage";
import { requireUser } from "@/lib/auth";
import { loadDecks } from "@/lib/decks";
import { loadLiveDecks } from "@/lib/live";
import { listStudentClasses, listTeacherClasses, withProgress } from "@/lib/classes";
import { loadOutlines } from "@/lib/routes";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Hub · PENTA" };

export default async function HubPage() {
  const user = await requireUser();
  const supabase = await createClient();
  const [listed, outlines, decks, live] = await Promise.all([
    user.role === "teacher" ? listTeacherClasses(supabase, user.id) : listStudentClasses(supabase, user.id),
    loadOutlines(supabase, user.id),
    loadDecks(supabase, user.id),
    loadLiveDecks(supabase),
  ]);
  const classes = withProgress<{ id: string; code: string; title: string; section: string }>(listed, outlines);

  return (
    <ScrollStage>
      <AppBar user={user} />
      <main id="main">
        <HubHero role={user.role} classes={classes} decks={decks} live={live} />
        <HubLayers role={user.role} classes={classes} decks={decks} live={live} />
      </main>
    </ScrollStage>
  );
}
