import { NextResponse } from "next/server";
import { z } from "zod";
import { loadGradebook } from "@/components/grades/gradebook/load";
import { getCurrentUser } from "@/lib/auth";
import { isClassOwner } from "@/lib/classes";
import { csvFile } from "@/lib/csv";
import { gradebookCsvRows, gradesFileName } from "@/lib/gradebook";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const classIdSchema = z.uuid();
const headers = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };

function notFound(): NextResponse {
  return new NextResponse("Not found", { status: 404, headers });
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  const classId = classIdSchema.safeParse((await params).id);
  if (!user || user.role !== "teacher" || !classId.success) return notFound();

  const supabase = await createClient();
  if (!(await isClassOwner(supabase, classId.data, user.id))) return notFound();

  const gradebook = await loadGradebook(supabase, classId.data, user.id);
  if (gradebook.status === "not_found") return notFound();
  if (gradebook.status === "failed") {
    return new NextResponse("The gradebook is not available right now. Try again.", { status: 503, headers });
  }

  return new NextResponse(csvFile(gradebookCsvRows(gradebook.model)), {
    headers: {
      ...headers,
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${gradesFileName(gradebook.code)}"`,
    },
  });
}
