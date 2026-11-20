import type { ReactNode } from "react";

export type Status = "due" | "late" | "submitted" | "graded" | "live";

export type StatusChipProps = {
  status: Status;
  dot?: boolean;
  children: ReactNode;
};

export function StatusChip({ status, children }: StatusChipProps) {
  return <span data-status={status}>{children}</span>;
}
