import type { SupabaseClient } from "@supabase/supabase-js";
import { deckLimits, megabyte } from "@/lib/config";
import type { Database } from "@/lib/database.types";

type Supabase = SupabaseClient<Database>;
type DeckRow = Pick<
  Database["public"]["Tables"]["decks"]["Row"],
  "id" | "class_id" | "lesson_id" | "title" | "kind" | "slide_count" | "size_bytes" | "ready_at" | "created_at"
>;

export type DeckKind = "pdf" | "pptx";

export type DeckSummary = {
  id: string;
  classId: string;
  lessonId: string | null;
  title: string;
  kind: DeckKind;
  slideCount: number;
  sizeBytes: number;
  ready: boolean;
  viewedCount: number;
};

export type DeckDetail = DeckSummary & { pdfPath: string; originalPath: string | null };

export type StorageUsage = { usedBytes: number; reservedBytes: number; budgetBytes: number };

export type UsageLevel = "ok" | "nearly_full" | "full";

const deckColumns = "id, class_id, lesson_id, title, kind, slide_count, size_bytes, ready_at, created_at";

const deckKinds: readonly DeckKind[] = ["pdf", "pptx"];
const formatByKind = { pdf: "PDF", pptx: "PPTX" } as const satisfies Record<DeckKind, string>;
const extensionByKind = { pdf: "pdf", pptx: "pptx" } as const satisfies Record<DeckKind, string>;

export function toDeckKind(value: string): DeckKind {
  return deckKinds.find((kind) => kind === value) ?? "pdf";
}

export function deckFormat(kind: DeckKind): (typeof formatByKind)[DeckKind] {
  return formatByKind[kind];
}

export function downloadFileName(title: string, kind: DeckKind): string {
  const base = title
    .normalize("NFKD")
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    .replace(/-+$/, "");
  return `${base || "deck"}.${extensionByKind[kind]}`;
}

export function formatBytes(bytes: number): string {
  if (bytes < megabyte) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  const megabytes = bytes / megabyte;
  return `${megabytes >= 100 ? Math.round(megabytes) : Math.round(megabytes * 10) / 10} MB`;
}

export function toDeckSummary(row: DeckRow, viewedCount = 0): DeckSummary {
  const slideCount = row.slide_count ?? 0;
  return {
    id: row.id,
    classId: row.class_id,
    lessonId: row.lesson_id,
    title: row.title,
    kind: toDeckKind(row.kind),
    slideCount,
    sizeBytes: row.size_bytes,
    ready: row.ready_at !== null,
    viewedCount: Math.min(Math.max(viewedCount, 0), slideCount),
  };
}

export function toStorageUsage(value: unknown): StorageUsage | null {
  if (typeof value !== "object" || value === null) return null;
  const { used_bytes, reserved_bytes, budget_bytes } = value as Record<string, unknown>;
  if (typeof used_bytes !== "number" || typeof reserved_bytes !== "number" || typeof budget_bytes !== "number") {
    return null;
  }
  return { usedBytes: used_bytes, reservedBytes: reserved_bytes, budgetBytes: budget_bytes };
}

export function freeBytes({ usedBytes, reservedBytes, budgetBytes }: StorageUsage): number {
  return Math.max(0, budgetBytes - usedBytes - reservedBytes);
}

export function usageLevel(usage: StorageUsage): UsageLevel {
  if (freeBytes(usage) <= 0) return "full";
  const taken = usage.usedBytes + usage.reservedBytes;
  return taken >= usage.budgetBytes * deckLimits.nearlyFullRatio ? "nearly_full" : "ok";
}

async function withViewCounts(supabase: Supabase, rows: DeckRow[]): Promise<DeckSummary[]> {
  if (rows.length === 0) return [];
  const { data: counts } = await supabase.rpc("deck_view_counts");
  const viewed = new Map((counts ?? []).map((row) => [row.deck_id, row.viewed]));
  return rows.map((row) => toDeckSummary(row, viewed.get(row.id)));
}

export async function loadClassDecks(supabase: Supabase, classId: string): Promise<DeckSummary[]> {
  const { data } = await supabase
    .from("decks")
    .select(deckColumns)
    .eq("class_id", classId)
    .order("created_at")
    .order("id");
  return withViewCounts(supabase, data ?? []);
}

export async function loadDecks(supabase: Supabase): Promise<DeckSummary[]> {
  const { data } = await supabase.from("decks").select(deckColumns).order("created_at").order("id");
  return withViewCounts(supabase, data ?? []);
}

export async function loadDeck(supabase: Supabase, deckId: string): Promise<DeckDetail | null> {
  const { data } = await supabase
    .from("decks")
    .select(`${deckColumns}, pdf_path, original_path`)
    .eq("id", deckId)
    .maybeSingle();
  if (!data) return null;
  return { ...toDeckSummary(data), pdfPath: data.pdf_path, originalPath: data.original_path };
}

export async function loadViewedSlides(supabase: Supabase, deckId: string, userId: string): Promise<number[]> {
  const { data } = await supabase
    .from("deck_views")
    .select("slide_no")
    .eq("deck_id", deckId)
    .eq("student_id", userId)
    .order("slide_no");
  return (data ?? []).map((row) => row.slide_no);
}

export async function loadStorageUsage(supabase: Supabase): Promise<StorageUsage | null> {
  const { data } = await supabase.rpc("storage_usage");
  return toStorageUsage(data);
}
