export type RouteCardProps = {
  href: string;
  code: string;
  section: string;
  title: string;
  lessonsDone: number;
  lessonsTotal: number;
  meters: number;
};

export function RouteCard({ href, title }: RouteCardProps) {
  return <a href={href}>{title}</a>;
}
