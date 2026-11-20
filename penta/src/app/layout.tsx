import type { Metadata } from "next";
import { fontVariables } from "@/app/fonts";
import { themeBootScript } from "@/lib/theme";
import "@/styles/tokens.css";
import "@/styles/globals.css";

export const metadata: Metadata = {
  title: "PENTA",
  description: "A school platform in three layers: Routes, Decks and Ops.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" data-theme="light" className={fontVariables} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootScript }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
