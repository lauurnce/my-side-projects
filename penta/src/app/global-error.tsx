"use client";

import { fontVariables } from "@/app/fonts";
import { SectionError } from "@/components/app/StatePage";
import "@/styles/tokens.css";
import "@/styles/globals.css";

export default function GlobalError({ reset }: { error: Error; reset: () => void }) {
  return (
    <html lang="en" data-theme="light" className={fontVariables}>
      <body>
        <main id="main">
          <SectionError reset={reset} />
        </main>
      </body>
    </html>
  );
}
