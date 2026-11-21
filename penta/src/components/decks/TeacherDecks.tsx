import { runDeckAction } from "@/app/decks/upload-actions";
import teacherStyles from "@/components/classes/teacher/teacher.module.css";
import { BracketLabel } from "@/components/ui/BracketLabel";
import type { CurrentUser } from "@/lib/auth";
import { loadClassDecks, loadStorageUsage, usageLevel } from "@/lib/decks";
import { loadClassOutline } from "@/lib/routes";
import { createClient } from "@/lib/supabase/server";
import { DeckBoard } from "./teacher/DeckBoard";
import { DeckUploadForm } from "./teacher/DeckUploadForm";
import { deckCountLabel, lessonGroups } from "./teacher/labels";
import { StorageMeter } from "./teacher/StorageMeter";

export type TeacherDecksProps = {
  user: CurrentUser;
  classId: string;
};

export async function TeacherDecks({ user, classId }: TeacherDecksProps) {
  const supabase = await createClient();
  const [decks, usage, outline] = await Promise.all([
    loadClassDecks(supabase, classId, user.id),
    loadStorageUsage(supabase),
    loadClassOutline(supabase, classId, user.id),
  ]);
  const lessons = lessonGroups(outline);
  const storageFull = usage !== null && usageLevel(usage) === "full";

  return (
    <section className={teacherStyles.section} aria-labelledby="decks-title">
      <div className={teacherStyles.sectionHead}>
        <h2 id="decks-title" className={teacherStyles.sectionTitle}>
          Decks
        </h2>
        <BracketLabel>{deckCountLabel(decks.length)}</BracketLabel>
      </div>
      <StorageMeter usage={usage} />
      <DeckUploadForm classId={classId} lessons={lessons} storageFull={storageFull} />
      <DeckBoard decks={decks} lessons={lessons} action={runDeckAction} />
    </section>
  );
}
