import type { CurrentUser } from "@/lib/auth";
import type { Activity } from "@/lib/quiz";

export type QuizResultsProps = { user: CurrentUser; activity: Activity };

export async function QuizResults({ activity }: QuizResultsProps) {
  return <h1>{activity.title}</h1>;
}
