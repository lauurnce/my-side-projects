import type { Metadata } from "next";
import { AppBar } from "@/components/app/AppBar";
import { HubHero, HubLayers } from "@/components/hub/Hub";
import { ScrollStage } from "@/components/landing/ScrollStage";
import { requireUser } from "@/lib/auth";
import { listStudentClasses, listTeacherClasses } from "@/lib/classes";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Hub · PENTA" };

export default async function HubPage() {
  const user = await requireUser();
  const supabase = await createClient();
  const classes =
    user.role === "teacher"
      ? await listTeacherClasses(supabase, user.id)
      : await listStudentClasses(supabase, user.id);

  return (
    <ScrollStage>
      <AppBar user={user} />
      <main id="main">
        <HubHero role={user.role} classes={classes} />
        <HubLayers role={user.role} classes={classes} />
      </main>
    </ScrollStage>
  );
}
