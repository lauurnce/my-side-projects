import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";
import { ThreadScreen } from "@/components/threads/ThreadScreen";
import { requireUser } from "@/lib/auth";
import { loadThreadView } from "@/lib/threads";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Question · PENTA" };

const threadIdSchema = z.uuid();

export default async function ThreadPage({ params }: PageProps<"/threads/[id]">) {
  const user = await requireUser();
  const threadId = threadIdSchema.safeParse((await params).id);
  if (!threadId.success) notFound();

  const view = await loadThreadView(await createClient(), threadId.data);
  if (!view || view.status !== "ok") notFound();

  return <ThreadScreen user={user} initial={view} />;
}
