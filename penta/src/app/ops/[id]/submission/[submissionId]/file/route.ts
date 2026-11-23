import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { submissionUpload } from "@/lib/config";
import { loadActivity } from "@/lib/quiz";
import { signSubmissionFile } from "@/lib/submission-storage";
import { submissionDownloadName } from "@/lib/submissions";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const paramsSchema = z.object({ id: z.uuid(), submissionId: z.uuid() });
const headers = { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" };
const unknownStudent = "Student";

function notFound(): NextResponse {
  return new NextResponse("Not found", { status: 404, headers });
}

export async function GET(_request: Request, { params }: RouteContext<"/ops/[id]/submission/[submissionId]/file">) {
  const user = await getCurrentUser();
  const ids = paramsSchema.safeParse(await params);
  if (!user || !ids.success) return notFound();

  const supabase = await createClient();
  const { data: submission } = await supabase
    .from("submissions")
    .select("activity_id, student_id, file_path, mime")
    .eq("id", ids.data.submissionId)
    .eq("activity_id", ids.data.id)
    .maybeSingle();
  if (!submission?.file_path) return notFound();

  const [activity, { data: student }] = await Promise.all([
    loadActivity(supabase, submission.activity_id),
    supabase.from("profiles").select("full_name").eq("id", submission.student_id).maybeSingle(),
  ]);
  if (!activity) return notFound();

  const fileKind = submission.mime === submissionUpload.mimeTypeByExtension.pdf ? "PDF" : "DOCX";
  const name = submissionDownloadName(student?.full_name ?? unknownStudent, activity.title, fileKind);
  const url = await signSubmissionFile(submission.file_path, name);
  if (!url) {
    return new NextResponse("The file is not available right now. Try again.", { status: 503, headers });
  }
  return NextResponse.redirect(url, { status: 302, headers });
}
