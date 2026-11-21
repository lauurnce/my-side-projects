import type { DeckDetail } from "@/lib/decks";

export type DeckSource = { url: string; length: number };

export type DeckViewerProps = {
  deck: DeckDetail;
  source: DeckSource | null;
  viewedSlides: number[];
  recordsViews: boolean;
};

export function DeckViewer({ deck }: DeckViewerProps) {
  return <h1>{deck.title}</h1>;
}
