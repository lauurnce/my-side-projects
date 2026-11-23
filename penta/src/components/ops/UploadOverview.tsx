import type { CurrentUser } from "@/lib/auth";
import type { Activity } from "@/lib/quiz";
import { HandInView } from "./handin/HandInView";
import { loadHandIn } from "./handin/load";

export type UploadOverviewProps = { user: CurrentUser; activity: Activity };

export async function UploadOverview({ user, activity }: UploadOverviewProps) {
  const { submission, now } = await loadHandIn(activity, user.id);

  return <HandInView activity={activity} submission={submission} now={now} />;
}
