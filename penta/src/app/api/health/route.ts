import { isDatabaseReachable } from "@/lib/supabase/health";

export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json({ status: "ok", database: await isDatabaseReachable() });
}
