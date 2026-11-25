import type { Metadata } from "next";
import { StatePage } from "@/components/app/StatePage";

export const metadata: Metadata = { title: "Not found · PENTA" };

export default function NotFound() {
  return (
    <main id="main">
      <StatePage label="404" title="Not found" href="/" linkText="Back to PENTA">
        This page does not exist, or it is no longer available to you.
      </StatePage>
    </main>
  );
}
