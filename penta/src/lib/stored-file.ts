import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

export type StoredFile = { size: number; contentType: string; etag: string };

export async function storedFile(bucket: string, path: string): Promise<StoredFile | null | "unavailable"> {
  const { data, error } = await createAdminClient().storage.from(bucket).info(path);
  if (data && typeof data.size === "number") {
    return { size: data.size, contentType: data.contentType ?? "", etag: data.etag ?? "" };
  }
  const code = (error as { statusCode?: string } | null)?.statusCode;
  return code === "404" ? null : "unavailable";
}

export async function readRange(bucket: string, path: string, start: number, end: number): Promise<Uint8Array | null> {
  const { data } = await createAdminClient().storage.from(bucket).createSignedUrl(path, 60);
  if (!data) return null;
  const response = await fetch(data.signedUrl, { headers: { Range: `bytes=${start}-${end}` }, cache: "no-store" });
  if (response.status !== 206) return null;
  const bytes = new Uint8Array(await response.arrayBuffer());
  return bytes.length === end - start + 1 ? bytes : null;
}
