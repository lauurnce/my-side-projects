type Pdfjs = typeof import("pdfjs-dist/legacy/build/pdf.mjs");

let loading: Promise<Pdfjs> | null = null;

export const documentOptions = { isEvalSupported: false, enableXfa: false, stopAtErrors: true } as const;

export function loadPdfjs(): Promise<Pdfjs> {
  loading ??= import("pdfjs-dist/legacy/build/pdf.mjs").then((pdfjs) => {
    pdfjs.GlobalWorkerOptions.workerSrc = new URL(
      "pdfjs-dist/legacy/build/pdf.worker.min.mjs",
      import.meta.url,
    ).toString();
    return pdfjs;
  });
  return loading;
}
