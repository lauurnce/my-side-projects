import type { CurrentUser } from "@/lib/auth";
import type { Activity } from "@/lib/quiz";

export type QuizOverviewProps = { user: CurrentUser; activity: Activity };

export async function QuizOverview({ activity }: QuizOverviewProps) {
  return <h1>{activity.title}</h1>;
}
