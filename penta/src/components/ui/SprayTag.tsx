import type { ReactNode } from "react";

export type SprayTagProps = {
  children: ReactNode;
  className?: string;
};

export function SprayTag({ children, className }: SprayTagProps) {
  return (
    <span aria-hidden="true" className={className}>
      {children}
    </span>
  );
}
