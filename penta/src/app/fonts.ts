import { Big_Shoulders, Inter, JetBrains_Mono, Sedgwick_Ave_Display } from "next/font/google";

const display = Big_Shoulders({
  subsets: ["latin"],
  axes: ["opsz"],
  variable: "--face-display",
  adjustFontFallback: false,
});

const body = Inter({ subsets: ["latin"], variable: "--face-body" });

const mono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--face-mono",
  adjustFontFallback: false,
});

const tag = Sedgwick_Ave_Display({
  subsets: ["latin"],
  weight: "400",
  variable: "--face-tag",
  adjustFontFallback: false,
});

export const fontVariables = [display, body, mono, tag].map((font) => font.variable).join(" ");
