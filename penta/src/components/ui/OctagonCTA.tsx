export type OctagonSize = 124 | 96 | 72;

export type OctagonCTAProps = {
  href: string;
  eyebrow: string;
  title: string;
  size?: OctagonSize;
};

export function OctagonCTA({ href, eyebrow, title }: OctagonCTAProps) {
  return (
    <a href={href}>
      {eyebrow} {title}
    </a>
  );
}
