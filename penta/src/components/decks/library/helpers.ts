import type { DeckSummary } from "@/lib/decks";
import { publishedLessons, type ClassOutline } from "@/lib/routes";

export const hubDeckLimit = 6;

export const unknownClassCode = "Class";

export function deckHref(deckId: string): string {
  return `/decks/${deckId}`;
}

export function deckCountLabel(count: number): string {
  return count === 1 ? "1 deck" : `${count} decks`;
}

export function slideCountLabel(count: number): string {
  return count === 1 ? "1 slide" : `${count} slides`;
}

export function visibleLessonTitles(outline: ClassOutline): Map<string, string> {
  return new Map(publishedLessons(outline).map((lesson) => [lesson.id, lesson.title]));
}

export function deckEyebrow(
  deck: Pick<DeckSummary, "lessonId">,
  lessonTitles: Map<string, string>,
  classCode: string,
): string {
  if (!deck.lessonId) return classCode;
  return lessonTitles.get(deck.lessonId) ?? classCode;
}

export function classCodes(classes: { id: string; code: string }[]): Map<string, string> {
  return new Map(classes.map((item) => [item.id, item.code]));
}

export function readyDecks(decks: DeckSummary[]): DeckSummary[] {
  return decks.filter((deck) => deck.ready);
}

export function lessonDecks(decks: DeckSummary[], lessonId: string): DeckSummary[] {
  return readyDecks(decks).filter((deck) => deck.lessonId === lessonId);
}

export function viewedTotalsLabel(decks: Pick<DeckSummary, "viewedCount" | "slideCount">[]): string {
  const viewed = decks.reduce((total, deck) => total + deck.viewedCount, 0);
  const slides = decks.reduce((total, deck) => total + deck.slideCount, 0);
  return `Viewed ${viewed} of ${slides} ${slides === 1 ? "slide" : "slides"}`;
}

export function liveDeckIds(live: { deckId: string }[]): Set<string> {
  return new Set(live.map((item) => item.deckId));
}

export function liveFirst<Deck extends { id: string }>(decks: Deck[], liveIds: ReadonlySet<string>): Deck[] {
  return [...decks.filter((deck) => liveIds.has(deck.id)), ...decks.filter((deck) => !liveIds.has(deck.id))];
}

export function liveByTitle(decks: DeckSummary[], liveIds: ReadonlySet<string>): DeckSummary[] {
  return readyDecks(decks)
    .filter((deck) => liveIds.has(deck.id))
    .sort((first, second) => first.title.localeCompare(second.title));
}

export function moreLiveLabel(extra: number): string {
  return extra > 0 ? `and ${extra} more` : "";
}
