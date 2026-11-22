import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

export function missingSlides(viewedSlides: number[], slideCount: number): number[] {
  const viewed = new Set(viewedSlides);
  const missing: number[] = [];
  for (let slide = 1; slide <= slideCount; slide += 1) {
    if (!viewed.has(slide)) missing.push(slide);
  }
  return missing;
}

export async function loadDeckFinished(
  supabase: SupabaseClient<Database>,
  deckId: string,
  studentId: string,
): Promise<boolean> {
  const { data } = await supabase.rpc("deck_finished", { target_deck: deckId, target_student: studentId });
  return data === true;
}
