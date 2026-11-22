import type { CurrentUser } from "@/lib/auth";
import type { Activity } from "@/lib/quiz";

export type QuizBuilderProps = { user: CurrentUser; activity: Activity };

export async function QuizBuilder({ activity }: QuizBuilderProps) {
  return <h1>{activity.title}</h1>;
}
