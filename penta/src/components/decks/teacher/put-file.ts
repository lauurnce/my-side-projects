import type { UploadTarget } from "@/lib/deck-storage";

export const uploadAborted = "upload_aborted";

export function putFile(
  target: UploadTarget,
  file: File,
  onProgress: (loadedBytes: number) => void,
  signal: AbortSignal,
): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new Error(uploadAborted));
      return;
    }

    const request = new XMLHttpRequest();
    const abort = () => request.abort();
    const settle = (finish: () => void) => {
      signal.removeEventListener("abort", abort);
      finish();
    };

    request.open("PUT", target.url);
    request.setRequestHeader("content-type", target.contentType);
    request.setRequestHeader("x-upsert", "false");
    request.upload.onprogress = (event) => onProgress(event.loaded);
    request.onload = () => {
      const stored = request.status >= 200 && request.status < 300;
      settle(() => (stored ? resolve() : reject(new Error("upload_refused"))));
    };
    request.onerror = () => settle(() => reject(new Error("upload_failed")));
    request.ontimeout = () => settle(() => reject(new Error("upload_failed")));
    request.onabort = () => settle(() => reject(new Error(uploadAborted)));
    signal.addEventListener("abort", abort);
    request.send(file);
  });
}
