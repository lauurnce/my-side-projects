import type { CurrentUser } from "@/lib/auth";
import type { Activity } from "@/lib/quiz";

export type UploadBuilderProps = { user: CurrentUser; activity: Activity };

export async function UploadBuilder({ activity }: UploadBuilderProps) {
  return <h1>{activity.title}</h1>;
}
