import { runOutlineAction } from "@/app/classes/routes-actions";
import type { CurrentUser } from "@/lib/auth";
import { loadClassOutline } from "@/lib/routes";
import { createClient } from "@/lib/supabase/server";
import { OutlineBoard } from "./outline/OutlineBoard";

export type TeacherOutlineProps = {
  user: CurrentUser;
  classId: string;
};

export async function TeacherOutline({ user, classId }: TeacherOutlineProps) {
  const supabase = await createClient();
  const outline = await loadClassOutline(supabase, classId, user.id);

  return <OutlineBoard outline={outline} action={runOutlineAction} />;
}
