"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import {
  joinCodeSchema,
  joinDestination,
  joinFailure,
  joinResultSchema,
  type JoinResult,
  type JoinState,
} from "./student-join";

async function callJoinClass(code: string): Promise<JoinResult | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("join_class", { code });
  if (error) return null;
  return joinResultSchema.safeParse(data).data ?? null;
}

export async function joinClass(_previousState: JoinState, formData: FormData): Promise<JoinState> {
  await requireRole("student");

  const code = joinCodeSchema.safeParse(formData.get("code"));
  if (!code.success) return { codeError: code.error.issues[0].message };

  const result = await callJoinClass(code.data).catch(() => null);
  if (!result) return { ...joinFailure("error"), code: code.data };

  const destination = joinDestination(result);
  if (destination && result.status === "joined") {
    revalidatePath("/classes");
    revalidatePath("/hub");
  }
  if (destination) redirect(destination);

  if (result.status === "joined" || result.status === "already") return { ...joinFailure("error"), code: code.data };
  return { ...joinFailure(result.status, result.retry_at), code: code.data };
}
