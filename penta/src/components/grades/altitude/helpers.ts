import { formatMeters } from "@/lib/classes";
import { altitudeWeights, routeLimits } from "@/lib/config";
import { altitudeFor, type Altitude, type ClassAltitude } from "@/lib/grades";

export const leftOutText = "Nothing to count yet. This class is left out of your average.";

export const summitMeters = routeLimits.summitMeters;

export function anyClassCounts(altitude: Altitude): boolean {
  return altitude.classes.some((item) => item.counts);
}

export function classMeters(altitude: Altitude, classId: string): number {
  const found = altitudeFor(altitude, classId);
  return found && found.counts ? found.meters : 0;
}

export function countedParts(item: ClassAltitude): string[] {
  if (!item.counts) return [];
  return [
    item.lessonsPublished > 0 ? "lessons" : null,
    item.decks > 0 ? "decks" : null,
    item.pointsPossible > 0 ? "graded work" : null,
  ].filter((part): part is string => part !== null);
}

export function breakdownText(item: ClassAltitude | null): string {
  if (!item || !item.counts) return leftOutText;
  return [
    item.lessonsPublished > 0 ? `Lessons ${item.lessonsDone} of ${item.lessonsPublished}` : "No lessons yet",
    item.decks > 0 ? `Decks ${item.decksFinished} of ${item.decks}` : "No decks yet",
    item.pointsPossible > 0 ? `Points ${item.pointsEarned} of ${item.pointsPossible}` : "No graded work yet",
  ].join(" · ");
}

export function basisNote(item: ClassAltitude | null): string | null {
  const parts = item ? countedParts(item) : [];
  if (parts.length === 1) return `Based on ${parts[0]} only.`;
  if (parts.length === 2) return `Based on ${parts[0]} and ${parts[1]}.`;
  return null;
}

export function altitudeLine(meters: number): string {
  return `${formatMeters(meters)} m of ${formatMeters(summitMeters)} m`;
}

export function weightsSentence(): string {
  const { lessons, decks, activities } = altitudeWeights;
  return `Altitude is progress, not a grade. Lessons count for ${formatMeters(lessons)} m, decks for ${formatMeters(decks)} m and graded work for ${formatMeters(activities)} m. A part with nothing to count is skipped and the rest is scaled up.`;
}
