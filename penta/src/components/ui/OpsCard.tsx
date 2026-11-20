import type { ReactNode } from "react";

export type OpsCardProps = {
  href: string;
  icon: ReactNode;
  kind: string;
  title: string;
  detail: string;
  status: ReactNode;
};

export function OpsCard({ href, title }: OpsCardProps) {
  return <a href={href}>{title}</a>;
}
