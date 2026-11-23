import type { CurrentUser } from "@/lib/auth";
import type { Activity } from "@/lib/quiz";

export type UploadOverviewProps = { user: CurrentUser; activity: Activity };

export async function UploadOverview({ activity }: UploadOverviewProps) {
  return <h1>{activity.title}</h1>;
}
