"use client";

import { useFormStatus } from "react-dom";
import { FilterPill } from "@/components/ui/FilterPill";

export function RemoveButton({ studentName }: { studentName: string }) {
  const { pending } = useFormStatus();

  return (
    <FilterPill type="submit" disabled={pending} aria-label={`Remove ${studentName}`}>
      Remove
    </FilterPill>
  );
}
