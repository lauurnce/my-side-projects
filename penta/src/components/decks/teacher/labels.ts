import { deckFormat, formatBytes, type DeckSummary, type StorageUsage, type UsageLevel } from "@/lib/decks";
import type { ClassOutline } from "@/lib/routes";

export type LessonChoice = { id: string; label: string; published: boolean };

export type LessonGroup = { moduleId: string; moduleTitle: string; lessons: LessonChoice[] };

export const meterMessages = {
  unknown: "Deck storage could not be loaded.",
  nearlyFull: "Storage is almost full. Delete decks you no longer need.",
  full: "Storage is full.",
} as const;

export const emptyDecksMessage = "No decks yet. Upload the first one.";

export const draftLessonNote = "Students see this deck after the lesson is published.";

export function storageSentence(usage: StorageUsage): string {
  return `Deck storage: ${formatBytes(usage.usedBytes)} of ${formatBytes(usage.budgetBytes)} used`;
}

export function reservedSentence(usage: StorageUsage): string | null {
  if (usage.reservedBytes <= 0) return null;
  return `${formatBytes(usage.reservedBytes)} reserved by uploads in progress`;
}

export function takenPercent({ usedBytes, reservedBytes, budgetBytes }: StorageUsage): number {
  if (budgetBytes <= 0) return 100;
  const ratio = (usedBytes + reservedBytes) / budgetBytes;
  return Math.min(100, Math.max(0, Math.floor(ratio * 100)));
}

export function percentSentence(usage: StorageUsage): string {
  return `${takenPercent(usage)}% taken`;
}

export function levelSentences(level: UsageLevel): string[] {
  if (level === "full") return [meterMessages.nearlyFull, meterMessages.full];
  return level === "nearly_full" ? [meterMessages.nearlyFull] : [];
}

export function slidesLabel(count: number): string {
  return `${count} ${count === 1 ? "slide" : "slides"}`;
}

export function deckMeta(deck: DeckSummary): string {
  const file = `${deckFormat(deck.kind)} · ${formatBytes(deck.sizeBytes)}`;
  return deck.ready ? `${slidesLabel(deck.slideCount)} · ${file}` : file;
}

export function deckCountLabel(count: number): string {
  return `${count} ${count === 1 ? "deck" : "decks"}`;
}

export function deckPath(deckId: string): string {
  return `/decks/${deckId}`;
}

export function deckDownloadPath(deckId: string): string {
  return `${deckPath(deckId)}/download`;
}

export function lessonGroups(outline: ClassOutline): LessonGroup[] {
  return outline.modules
    .filter((moduleItem) => moduleItem.lessons.length > 0)
    .map((moduleItem) => ({
      moduleId: moduleItem.id,
      moduleTitle: moduleItem.title,
      lessons: moduleItem.lessons.map((lesson) => ({
        id: lesson.id,
        label: lesson.published ? lesson.title : `${lesson.title} (Draft)`,
        published: lesson.published,
      })),
    }));
}

export function isLinkedToDraft(deck: DeckSummary, groups: LessonGroup[]): boolean {
  if (!deck.lessonId) return false;
  const lesson = groups.flatMap((group) => group.lessons).find((choice) => choice.id === deck.lessonId);
  return lesson ? !lesson.published : false;
}
