import { startQuiz } from "@/app/ops/attempt-actions";
import type { CurrentUser } from "@/lib/auth";
import { missingSlides } from "@/lib/deck-progress";
import { loadDeck, loadViewedSlides } from "@/lib/decks";
import { loadOwnAttempts, type Activity } from "@/lib/quiz";
import { createClient } from "@/lib/supabase/server";
import type { DeckGate } from "./taking/helpers";
import { OverviewView } from "./taking/OverviewView";

export type QuizOverviewProps = { user: CurrentUser; activity: Activity };

type Supabase = Awaited<ReturnType<typeof createClient>>;

async function loadDeckGate(supabase: Supabase, deckId: string | null, userId: string): Promise<DeckGate> {
  if (!deckId) return { state: "none" };
  const [deck, viewedSlides] = await Promise.all([
    loadDeck(supabase, deckId),
    loadViewedSlides(supabase, deckId, userId),
  ]);
  if (!deck) return { state: "unreadable" };

  const missing = missingSlides(viewedSlides, deck.slideCount).length;
  if (deck.slideCount > 0 && missing === 0) return { state: "none" };
  return { state: "locked", viewed: deck.slideCount - missing, total: deck.slideCount, href: `/decks/${deck.id}` };
}

async function loadOverview(activity: Activity, userId: string) {
  const supabase = await createClient();
  const [attempts, gate] = await Promise.all([
    loadOwnAttempts(supabase, userId, [activity.id]),
    loadDeckGate(supabase, activity.requiresDeckId, userId),
  ]);
  return { attempts, gate, now: Date.now() };
}

export async function QuizOverview({ user, activity }: QuizOverviewProps) {
  const { attempts, gate, now } = await loadOverview(activity, user.id);

  return <OverviewView activity={activity} attempts={attempts} gate={gate} now={now} action={startQuiz} />;
}
