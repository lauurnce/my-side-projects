"use client";

import { useEffect } from "react";
import { applyStoredTheme } from "@/lib/theme";

export function ThemeSync() {
  useEffect(() => {
    applyStoredTheme(document.documentElement, document.cookie);
  }, []);

  return null;
}
