import { requireRole } from "@/lib/auth";
import { attemptsLeft, isPastDue, loadOwnAttempts, type Activity, type SubmittedReview } from "@/lib/quiz";
import { createClient } from "@/lib/supabase/server";
import { ResultView } from "./taking/ResultView";

export type QuizResultProps = { activity: Activity; attemptId: string; review: SubmittedReview };

async function loadCanRetry(activity: Activity, review: SubmittedReview): Promise<boolean> {
  const user = await requireRole("student");
  if (review.reveal || isPastDue(activity, Date.now())) return false;
  const attempts = await loadOwnAttempts(await createClient(), user.id, [activity.id]);
  return attemptsLeft(activity, attempts) > 0;
}

export async function QuizResult({ activity, review }: QuizResultProps) {
  const canRetry = await loadCanRetry(activity, review);

  return <ResultView activity={activity} review={review} canRetry={canRetry} />;
}
