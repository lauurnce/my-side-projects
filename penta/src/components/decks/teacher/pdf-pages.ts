import { documentOptions, loadPdfjs } from "@/lib/pdf-client";
import { checkPageCount, openFailureMessage, type PageCheck } from "./upload-checks";

export async function countPdfPages(file: File): Promise<PageCheck> {
  try {
    const pdfjs = await loadPdfjs();
    const task = pdfjs.getDocument({ data: await file.arrayBuffer(), ...documentOptions });
    try {
      const document = await task.promise;
      return checkPageCount(document.numPages);
    } finally {
      await task.destroy().catch(() => undefined);
    }
  } catch (error) {
    return { ok: false, message: openFailureMessage(error) };
  }
}
