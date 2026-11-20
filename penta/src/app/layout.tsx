import type { Metadata } from "next";
import { cookies } from "next/headers";
import { fontVariables } from "@/app/fonts";
import { parseTheme, themeCookieName } from "@/lib/theme";
import "@/styles/tokens.css";
import "@/styles/globals.css";

export const metadata: Metadata = {
  title: "PENTA",
  description: "A school platform in three layers: Routes, Decks and Ops.",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const theme = parseTheme((await cookies()).get(themeCookieName)?.value);

  return (
    <html lang="en" data-theme={theme} className={fontVariables}>
      <body>{children}</body>
    </html>
  );
}
