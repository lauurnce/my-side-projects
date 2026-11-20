export const layers = [
  { index: "01", name: "Routes", use: "Learning management: classes, lessons, progress" },
  { index: "02", name: "Decks", use: "Presentations: viewer, live mode, editor" },
  { index: "03", name: "Ops", use: "Activities: quizzes, uploads, gradebook, threads" },
] as const;

export const brandDna = [
  {
    label: "From the streetwear ref · the swag",
    filled: false,
    points: [
      "Condensed all-caps headlines, stacked tight",
      "Tiny mono labels wrapped in [ brackets ]",
      "A spray-paint tag behind the hero, never readable copy",
      "Cards with two clipped corners",
      'The octagon "add to cart" button, reused as our one action per layer',
      "One-colour duotone imagery with film grain",
    ],
  },
  {
    label: "From the layered-stack ref · the structure",
    filled: false,
    points: [
      "One translucent plate per capability, stacked in isometric 3D",
      "A left index of pills; the active pill opens with one sentence",
      "Scroll drives the stack. The page does not hijack the wheel",
      "Lots of quiet space around the object",
    ],
  },
  {
    label: "PENTA rules",
    filled: true,
    points: [
      "Three layers replace the nav bar",
      "One primary action (the octagon) per layer",
      "Progress is altitude, shown in meters",
      "Gold appears only for LIVE and LATE",
      "Parchment cards hold content. The ground holds chrome",
      "Every status has a word, never color alone",
    ],
  },
] as const;

export const swatches = [
  { name: "Oxblood", hex: "#2B0609", use: "Ink. Text on parchment and cream", outlined: false },
  { name: "Garnet", hex: "#4A0A0F", use: "Decks layer in dark. Plate edges", outlined: false },
  { name: "Maroon", hex: "#800000", use: "PUP maroon. Text in light, ground in dark", outlined: true },
  { name: "Brick", hex: "#A84444", use: "Rules, idle fills. No small text on it", outlined: false },
  { name: "Parchment", hex: "#E4CC95", use: "Card ground. Ink on it is 11.8:1", outlined: false },
  { name: "Linen", hex: "#F1E3CF", use: "Muted text in dark (8.7:1)", outlined: false },
  { name: "Cream", hex: "#FCF7EC", use: "Text in dark (10.2:1)", outlined: false },
  { name: "Gold", hex: "#FFD700", use: "PUP gold. LIVE and LATE only. Ink text on it", outlined: false },
] as const;

export const themePreviews = [
  { theme: "light", label: "Light · default", ground: "Paper #F5F0E6" },
  { theme: "dark", label: "Dark", ground: "Maroon #800000" },
] as const;

export const tokenRows = [
  { name: "--bg", light: "#F5F0E6", dark: "#800000", use: "Page ground" },
  { name: "--bg-deep", light: "#EBE1CF", dark: "#4A0A0F", use: "Decks layer, deck frames, image boxes" },
  { name: "--fg", light: "#800000", dark: "#FCF7EC", use: "Text, lines, icons, filled buttons" },
  { name: "--fg-muted", light: "#94433D", dark: "#F1E3CF", use: "Labels and secondary text" },
  { name: "--fg-soft", light: "#B56C66", dark: "#E4CC95", use: "Quiet display text" },
  { name: "--fg-inv", light: "#FCF7EC", dark: "#2B0609", use: "Text on filled buttons and active pills" },
  { name: "--surface", light: "#FFFFFF", dark: "#F1E3CF", use: "Slides" },
  { name: "--chip-soft", light: "#E3D5BC", dark: "#F1E3CF", use: "Neutral chips" },
  { name: "--idle", light: "#D3C3A9", dark: "#A84444", use: "Unviewed slides, idle fills" },
  { name: "--shell", light: "#D9CDB8", dark: "#2B0609", use: "Frame behind the stacked panels" },
  { name: "--accent-mark", light: "#A87400", dark: "#FFD700", use: "Live dots and gold outlines on the ground" },
  { name: "--scrim-rgb", light: "rgb(245,240,230)", dark: "rgb(43,6,9)", use: "Fade under text that sits on the image" },
] as const;

export const sameInBoth = "Same in both: --card #E4CC95 · --ink #2B0609 · --ink-2 #4A0A0F · --accent #FFD700";

export const sizeRows = [
  { name: "XL", spec: "168 / 0.82" },
  { name: "L", spec: "96 / 0.86" },
  { name: "M", spec: "56 / 0.92" },
  { name: "S", spec: "30 / 1.0" },
] as const;

export const pills = [
  {
    index: "02",
    name: "Decks",
    sub: "Presentations",
    description:
      "Teachers upload PPTX or PDF. Students flip through, download, or follow a live session slide by slide.",
  },
  {
    index: "01",
    name: "Routes",
    sub: "LMS",
    description: "Your classes, lessons and modules in one route. Progress shows as altitude.",
  },
] as const;

export const viewOptions = [
  { value: "public", label: "Public" },
  { value: "hub", label: "Student hub" },
] as const;
