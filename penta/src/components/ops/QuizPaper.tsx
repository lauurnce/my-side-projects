import type { Activity, OpenPaper } from "@/lib/quiz";

export type QuizPaperProps = { activity: Activity; attemptId: string; paper: OpenPaper };

export function QuizPaper({ activity }: QuizPaperProps) {
  return <h1>{activity.title}</h1>;
}
