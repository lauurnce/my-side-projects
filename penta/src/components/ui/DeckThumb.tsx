export type DeckFormat = "PDF" | "PPTX";

export type DeckThumbProps = {
  href: string;
  eyebrow: string;
  title: string;
  slideCount: number;
  format: DeckFormat;
  viewedCount: number;
  live?: boolean;
};

export function DeckThumb({ href, title }: DeckThumbProps) {
  return <a href={href}>{title}</a>;
}
