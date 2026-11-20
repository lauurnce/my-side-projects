"use client";

import { switchTheme } from "@/lib/theme";

export function ThemeToggle() {
  return (
    <button type="button" onClick={() => switchTheme(document.documentElement, document)}>
      <span className="only-light">Dark</span>
      <span className="only-dark">Light</span>
    </button>
  );
}
