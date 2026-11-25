"use client";

import { SectionError } from "@/components/app/StatePage";

export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  return <SectionError reset={reset} />;
}
