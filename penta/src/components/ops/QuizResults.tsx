import type { CurrentUser } from "@/lib/auth";
import type { Activity } from "@/lib/quiz";
import { loadQuizResults } from "@/lib/quiz-results";
import { createClient } from "@/lib/supabase/server";
import { ResultsView } from "./results/ResultsView";

export type QuizResultsProps = { user: CurrentUser; activity: Activity };

export async function QuizResults({ activity }: QuizResultsProps) {
  const supabase = await createClient();
  return <ResultsView activity={activity} results={await loadQuizResults(supabase, activity)} />;
}
