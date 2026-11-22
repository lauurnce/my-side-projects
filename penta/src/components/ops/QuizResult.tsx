import type { Activity, SubmittedReview } from "@/lib/quiz";

export type QuizResultProps = { activity: Activity; attemptId: string; review: SubmittedReview };

export function QuizResult({ activity }: QuizResultProps) {
  return <h1>{activity.title}</h1>;
}
