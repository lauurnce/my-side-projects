import type { ReactNode } from "react";

export type BracketLabelProps = {
  children: ReactNode;
};

export function BracketLabel({ children }: BracketLabelProps) {
  return <span>[ {children} ]</span>;
}
