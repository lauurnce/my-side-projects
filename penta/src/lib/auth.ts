import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import type { Database } from "@/lib/database.types";
import { createClient } from "@/lib/supabase/server";

export type Role = "student" | "teacher";

export type CurrentUser = {
  id: string;
  fullName: string;
  role: Role;
};

type ProfileRow = Pick<Database["public"]["Tables"]["profiles"]["Row"], "id" | "full_name" | "role">;

function toCurrentUser(profile: ProfileRow): CurrentUser {
  return {
    id: profile.id,
    fullName: profile.full_name,
    role: profile.role === "teacher" ? "teacher" : "student",
  };
}

export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims.sub;
  if (!userId) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, full_name, role")
    .eq("id", userId)
    .maybeSingle();
  return profile ? toCurrentUser(profile) : null;
});

export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

export async function requireRole(role: Role): Promise<CurrentUser> {
  const user = await requireUser();
  if (user.role !== role) redirect("/classes");
  return user;
}
