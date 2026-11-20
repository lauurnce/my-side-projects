import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "PENTA",
  description: "A school platform in three layers: Routes, Decks and Ops.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
