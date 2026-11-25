# PENTA design

How PENTA looks and moves, and where each rule lives in the code. Every value here is taken
from the source. If this document and the code disagree, the code is right and this file needs
a fix.

Where to look:

| What | Where |
| --- | --- |
| Color, type and size tokens | `src/styles/tokens.css` |
| Base styles, focus ring, skip link, reduced motion | `src/styles/globals.css` |
| Fonts | `src/app/fonts.ts` |
| Shared components | `src/components/ui` |
| Landing page sections and scroll motion | `src/components/landing`, `src/lib/scroll-math.ts` |
| Landing page copy and sample data | `src/content/landing.ts` |
| Hub after login | `src/components/hub/Hub.tsx`, `src/app/hub/page.tsx` |
| Theme switch | `src/lib/theme.ts`, `src/components/ui/ThemeToggle.tsx` |
| Slide canvas | `src/components/slides/SlideRenderer.tsx`, `src/components/slides/slide.module.css` |
| Images | `public/design` |

A live style guide is served at `/styleguide`. It needs no login. It shows the palette, both
themes side by side, the token table, the type roles, every shared component and the imagery.

## 1. The idea

PENTA is one school platform with three layers.

| Layer | Name | What it holds |
| --- | --- | --- |
| 01 | Routes | Classes, modules, lessons, progress |
| 02 | Decks | Presentations: viewer, live mode, slide editor |
| 03 | Ops | Quizzes, file hand-ins, grading, gradebook, class threads |

The three layers replace the navigation bar. There is no bar with a Routes button, a Decks
button and an Ops button. The layers are full-screen panels, stacked in a fixed order, and the
user moves between them by scrolling.

On the landing page (`/`) this is shown twice. First as a scene: three plates drop into an
isometric stack as the page scrolls, one plate per layer. Then as the real thing: the Routes,
Decks and Ops panels pin to the top of the screen and each one slides up over the one before.
The panels on the landing page show sample data and each carries a `[ SAMPLE DATA ]` label.

After login the hub (`/hub`) uses the same three panels, with the same component
(`Panels` and `Panel` from `src/components/landing/Panels.tsx`) and the same cover motion, but
filled with the user's own classes, decks and activities. The hub has no plate scene. The app
bar above it holds the brand tag (a link to the hub), a link to Classes, a link to Grades for
students, the user's name and role, the theme switch and the sign out button. It does not list
the three layers.

Light is the default theme. Dark is the maroon version. One switch changes every page.

## 2. Brand rules

1. **Three layers replace the nav bar.** Routes, Decks and Ops are panels in a stack, on the
   landing page and on the hub.
2. **One primary action per layer: the octagon button.** `OctagonCTA` is an octagon outline with
   a diagonal arrow. The landing hero has one (`START CLIMB`), the Decks panel has one
   (`JOIN LIVE`) and the Ops panel has one (`OPEN OPS`). On the hub the hero has one and the
   Routes panel uses one for the next lesson.
3. **Progress is altitude, in meters.** A full term is 3,000 m. `AltitudeMeter` draws the scale
   from 0 to 3,000 m. `RouteCard` shows meters next to the lesson count.
4. **Gold is reserved.** In the interface, solid gold (`--accent`) marks LIVE and LATE: the
   Late `StatusChip`, the dot on the Live `StatusChip`, the LIVE chip on a `DeckThumb`, and the
   LIVE marks in the landing page samples (the hero deck card, the Decks panel chip and the
   `LIVE` tile on the Decks plate). In slides made in the editor, a teacher may fill one
   highlight box per slide with gold. The slide schema rejects a second gold box and the
   toolbar disables the option once one exists. The darker gold mark (`--accent-mark`) is also
   the keyboard focus ring, the outline on gold chips, the outline on the current slide in a
   thumbnail strip, and the underline under the word for a missing item in the grade tables.
5. **Parchment cards hold content. The ground holds chrome.** Cards use `--card` with `--ink`
   text in both themes. Bars, labels and buttons sit on `--bg`.
6. **Every status has a word.** Color never carries a status alone. A `StatusChip` is a word
   plus a dot, and the dot style differs by status.
7. **Headlines are condensed, all caps, stacked tight.** Big Shoulders at weight 800 or 900,
   uppercase, line-height 0.82 to 1.0.
8. **Small labels are mono, uppercase, in square brackets.** `BracketLabel` renders
   `[ LAYER 01 ]`. The brackets are hidden from screen readers.
9. **The spray tag is decoration.** `SprayTag` is always `aria-hidden`. The one exception in
   use is the brand link in the top bars, which uses the same lettering and carries an
   `aria-label`.
10. **Cards have two clipped corners: top right and bottom left.** The clip is 22 px
    (`--clip`), set with `clip-path`. `RouteCard` and `UnlockCard` use it, and the global
    `.clip-card` class applies it elsewhere.

Component styles use tokens only. A unit test (`src/components/hex.test.ts`) fails if any
`.tsx` or `.css` file under `src/components` contains a raw hex color.

## 3. Color tokens

All tokens are declared in `src/styles/tokens.css`. The light values sit on `:root` and
`[data-theme="light"]`. The dark values sit on `[data-theme="dark"]`.

Values that change with the theme:

| Token | Light (default) | Dark | Used for |
| --- | --- | --- | --- |
| `--bg` | `#F5F0E6` | `#800000` | Page ground |
| `--bg-deep` | `#EBE1CF` | `#4A0A0F` | Decks panel, deck frames |
| `--shell` | `#D9CDB8` | `#2B0609` | Frame behind the stacked panels |
| `--dim` | `#8C7F6A` | `#2B0609` | Overlay on a covered panel |
| `--fg` | `#800000` | `#FCF7EC` | Text, lines, icons, filled buttons |
| `--fg-muted` | `#94433D` | `#F1E3CF` | Labels and secondary text |
| `--fg-soft` | `#B56C66` | `#E4CC95` | Quiet display text, large sizes only |
| `--fg-inv` | `#FCF7EC` | `#2B0609` | Text on a filled button or active pill |
| `--fg-inv-2` | `#F1E3CF` | `#4A0A0F` | Secondary text on a filled surface |
| `--surface` | `#FFFFFF` | `#F1E3CF` | Slide surfaces: `DeckThumb` previews and the deck viewer |
| `--chip-soft` | `#E3D5BC` | `#F1E3CF` | Neutral chips |
| `--idle` | `#D3C3A9` | `#A84444` | Unviewed slides, idle fills |
| `--thumb-on` | `#FFFFFF` | `#FCF7EC` | The current slide in a thumbnail strip |
| `--accent-mark` | `#A87400` | `#FFD700` | Focus ring, live dots, gold marks on the ground |
| `--accent-edge` | `#A87400` | `#FFD700` | 1 px outline on gold chips |
| `--pill-idle` | `rgba(128, 0, 0, 0.06)` | `rgba(43, 6, 9, 0.35)` | Idle `IndexPill` fill |
| `--field` | `rgba(128, 0, 0, 0.04)` | `rgba(43, 6, 9, 0.25)` | Input fill, drag-over fill |
| `--panel-shadow` | `rgba(74, 10, 15, 0.18)` | `rgba(43, 6, 9, 0.45)` | Shadow above an incoming panel |
| `--plate-shadow` | radial gradient of `rgba(74, 10, 15, 0.3)` | radial gradient of `rgba(43, 6, 9, 0.6)` | Shadow under the plate stack |
| `--grain-blend` | `multiply` | `overlay` | Blend mode of the grain |
| `--bg-rgb` | `245, 240, 230` | `128, 0, 0` | `--bg` as channels, for fades |
| `--fg-rgb` | `128, 0, 0` | `252, 247, 236` | `--fg` as channels, for thin lines |
| `--fg-inv-rgb` | `252, 247, 236` | `43, 6, 9` | `--fg-inv` as channels |
| `--scrim-rgb` | `245, 240, 230` | `43, 6, 9` | Fade under text that sits on the building image |
| `--tag-rgb` | `128, 0, 0` | `252, 247, 236` | Spray tag |

Values that stay the same in both themes:

| Token | Value | Used for |
| --- | --- | --- |
| `--card` | `#E4CC95` Parchment | Cards |
| `--ink` | `#2B0609` Oxblood | Text on cards, slides and gold |
| `--ink-rgb` | `43, 6, 9` | `--ink` as channels, for progress tracks |
| `--ink-2` | `#4A0A0F` Garnet | Secondary text on cards |
| `--maroon` | `#800000` | Maroon text and maroon boxes on slides |
| `--on-ink` | `#FCF7EC` Cream | Text on an ink box, slide background |
| `--accent` | `#FFD700` PUP gold | LIVE, LATE, and one highlight box per slide |
| `--plate-mid` | `#A84444` Brick | Middle edge of a plate |
| `--plate-face` | gradient from cream to parchment | Top face of a plate |

Size tokens, also the same in both themes:

| Token | Value |
| --- | --- |
| `--display-xl`, `--display-l`, `--display-m`, `--display-s` | 168, 96, 56, 30 px |
| `--label` | 11 px |
| `--body` | 16 px |
| `--gutter` | 64 px |
| `--clip` | 22 px |
| `--radius-pill` | 999 px |
| `--radius-plate` | 26 px |
| `--stage-max` | 960 px |

Checked contrast (WCAG ratio). `src/styles/contrast.test.ts` reads `tokens.css`, computes
these pairs in both themes and fails the build if one falls under its minimum.

| Pair | Light | Dark | Minimum |
| --- | --- | --- | --- |
| `--fg` on `--bg` | 9.6 | 10.2 | 4.5 |
| `--fg-muted` on `--bg` | 5.9 | 8.7 | 4.5 |
| `--fg-muted` on `--bg-deep` | 5.2 | 12.4 | 4.5 |
| `--fg-soft` on `--bg` (large text only) | 3.5 | 7.0 | 3.0 |
| `--fg-inv` on `--fg` | 10.2 | 17.4 | 4.5 |
| `--ink` on `--card` | 11.8 | 11.8 | 4.5 |
| `--ink` on `--accent` | 13.2 | 13.2 | 4.5 |
| `--accent-mark` on `--bg` (marks and the focus ring) | 3.6 | 7.8 | 3.0 |

## 4. Type

Four fonts, each with one job. They are loaded with `next/font/google` in `src/app/fonts.ts`
and exposed as the CSS variables `--font-display`, `--font-body`, `--font-mono` and
`--font-tag`, each with system fallbacks.

| Role | Font | Rules |
| --- | --- | --- |
| Display | Big Shoulders, weight 800 or 900 | Uppercase. Token sizes 168, 96, 56 and 30 px. Line-height 0.82 to 1.0. Titles only. |
| Labels | JetBrains Mono, weight 400 (700 on gold chips) | 11 px, uppercase, letter-spacing 0.08em. Often in `[ brackets ]`. |
| Reading | Inter, weight 400 to 600 | 16 px, line-height 1.55. Lessons, instructions, feedback, form input. |
| Tag | Sedgwick Ave Display, weight 400 | Spray tag and brand lettering only. |

Sizes in use on the landing page: hero headline 168 px at line-height 0.82, panel titles
`clamp(56px, 10vh, 104px)`, stack title `clamp(44px, 7vh, 64px)`, footer headline 92 px, the
layer number in the counter 140 px.

Display type is for titles. Long text always uses Inter.

## 5. Components

Every shared component lives in `src/components/ui`, one file per component, with a CSS Module
and a test file next to it. Use these names.

| Name | What it is | States |
| --- | --- | --- |
| `OctagonCTA` | A link drawn as an octagon outline with a diagonal arrow, a mono eyebrow and a display title. Sizes 124, 96 and 72 px. | Hover and keyboard focus: the octagon fills with `--fg` and the arrow turns `--fg-inv`, over 0.25 s. |
| `IndexPill` | A pill button with the layer number, name, sub label and a plus mark, and one sentence of description under it. | Idle: `--pill-idle` fill, thin outline, plus mark, description closed. Active: `--fg` fill, `--fg-inv` text, radius 22 px, minus mark, description open, `aria-current`. |
| `StatusChip` | Mono chip with a dot and a word. | `due` (outline, hollow dot), `late` (gold, bold), `submitted` (soft), `graded` (parchment), `live` (ink with a gold dot). |
| `RouteCard` | Parchment card with clipped corners: course code, section, title, progress bar, lesson count, meters. Renders as a link when given an `href`. | Focus: ink outline inside the card. |
| `OpsCard` | Parchment icon tile next to a bordered text block with kind, title, detail and a status slot. Renders as a link when given an `href`. | The status slot takes a `StatusChip`. |
| `DeckThumb` | 16:9 slide preview in a `--bg-deep` frame, with slide count, format (`PDF`, `PPTX` or `SLIDES`) and viewed count. | Gold LIVE chip when `live` is set. |
| `UnlockCard` | Parchment card that shows how many slides of a deck are viewed, with a progress bar. | Locked: "Finish this deck to unlock". Unlocked when every slide is viewed: "Unlocked" and "Every slide seen". |
| `UploadDrop` | Dashed drop zone around a real file input, with a title, a hint and a status line. | Idle, drag over (solid border, `--field` fill), uploading (`aria-busy`, input disabled), error (solid border, message starts with "Error:"). |
| `AltitudeMeter` | Vertical scale from 0 to 3,000 m with a diamond marker, and the number in display type at 64 px. | The marker position follows the meters, clamped to the scale. |
| `Field` | Mono label above a 44 px input. | Focus ring. Error: 2 px border, `aria-invalid`, and a message that starts with "Error:". |
| `FilterPill` | Filled pill button, 36 px tall. | Disabled: half opacity. |
| `ViewSwitch` | Two-option segmented pill. | The active side is filled and has `aria-pressed="true"`. |
| `ThemeToggle` | Pill button with a moon or sun icon and the word Dark or Light. | Shows the theme it will switch to. |
| `BracketLabel` | Mono label in square brackets. | None. |
| `SprayTag` | Spray lettering behind a hero or an image. `aria-hidden`. | Color follows `--tag-rgb`. |
| `Grain` | Grain overlay from `public/design/grain.png`, tiled at 220 px, 55% opacity. | Blend mode changes with the theme. Hidden in print. |
| `Barcode` | Row of bars with an optional small caption. The bars are decoration. | None. |
| `Markdown`, `PostMarkdown` | Renders lesson text, activity instructions and thread posts as formatted text. Links show their host name and images become links. | None. |

Controls have a hit area at least 44 px tall. Where the visible shape is shorter (the theme
toggle at 38 px, `FilterPill` at 36 px, a `ViewSwitch` option at 30 px) an invisible
pseudo-element extends the target. Icons are inline stroke SVG. There are no icon fonts and no
emoji.

## 6. Landing page structure

`src/app/page.tsx` builds the page from the sections below, in this order. All copy and sample
data come from `src/content/landing.ts`.

1. **Top bar** (`TopBar`). Brand tag, three bracket labels, the theme toggle and a Log in link.
   It floats over the hero.
2. **Hero** (`Hero`, min height 960 px). Left: bracket labels, the headline `LEARN AT PENTA`,
   two label rows (Layers and Role), and the `OctagonCTA` `START CLIMB` at 124 px. Right: two
   small parchment cards (a deck with a LIVE chip and a quiz) and a `01` to `03` counter.
   Behind: the spray tag at 270 px and the building image, 70% wide and 80% tall, fading in
   from the left over its first 24%. The bottom 18% of the hero fades into `--bg`. A link at
   the bottom left jumps to the stack.
3. **Stack scene** (`StackScene`, wrapper 2,600 px tall, stage pinned). Left: the headline
   `THREE LAYERS. ONE BUILDING.` and the three `IndexPill`s. Center: the isometric stack of
   three plates. Right: the current layer number (`LayerCounter`) and a "Skip to the layers"
   link.
4. **Routes panel** (`RoutesPanel`, pinned). Title, labels, a filter label. One large feature
   card with the building image, then three `RouteCard`s. An altitude line at the bottom runs
   from 0 m to the 3,000 m summit.
5. **Decks panel** (`DecksPanel`, pinned, on `--bg-deep`). Title, labels and a gold LIVE chip.
   A slide viewer with a thumbnail strip. Side column: a live card, an unlock card and the
   `OctagonCTA` `JOIN LIVE` at 96 px.
6. **Ops panel** (`OpsPanel`, pinned). The line `WHEN THE DEADLINE HITS, EVERYTHING ELSE GOES
   QUIET.`, the `OctagonCTA` `OPEN OPS` at 96 px, then `OPS INVENTORY` with five items, each
   with an icon tile and a `StatusChip`.
7. **Footer** (`Footer`, min height 900 px). Spray tag, the building image on the lower 66%, a
   three-line headline at 92 px, a "Log in with school email" button and the `Barcode`.

Every octagon and log in link on the landing page goes to `/login`.

### The hub

The hub (`/hub`) is what a signed-in user sees. It is built from `HubHero` and `HubLayers`.

- The hero headline is the student's altitude (`YOU'RE AT 1,840 M` for a student at 1,840 m),
  with an `AltitudeMeter` beside it. A teacher sees `YOU TEACH` and the class count instead.
- Under the headline: a Live row when a deck is being presented, and for students the next due
  item. Then one `OctagonCTA` that opens the classes.
- The Routes panel shows up to three classes as `RouteCard`s. Students also get a "Continue
  where you left off" card with a 72 px octagon that opens the next lesson.
- The Decks panel lists the ready decks and shows a Live now chip when one is live.
- The Ops panel shows the student's activities as cards, or the teacher's latest activities as
  rows.
- Each panel has an empty state with a short sentence when there is nothing to show.

## 7. Motion

The landing page is scroll driven. It never takes over the wheel and never snaps to a section.

### How it is driven

`useLandingScroll` (`src/components/landing/useLandingScroll.ts`) adds one passive scroll
listener to the window. The listener only schedules a `requestAnimationFrame` callback, so at
most one update runs per frame. The same update also runs on resize and when the reduced motion
setting changes.

Each update reads a few element positions and writes CSS variables:

| Variable | Set on | Meaning |
| --- | --- | --- |
| `--d1`, `--d2`, `--d3` | the stack wrapper | Drop progress of the Routes, Decks and Ops plates, 0 to 1 |
| `--c1`, `--c2` | the panels wrapper | How far the Routes and Decks panels are covered, 0 to 1 |
| `--h` | the hero | How far the hero has scrolled away, 0 to 1 |

Values are written with four decimals and only when they change. The CSS does the rest with
`calc()`. The only value that reaches React is the active layer number (1, 2 or 3). It is kept
in a small store, so only the pills and the layer counter render again, and only when the
number changes.

All the math is in pure functions in `src/lib/scroll-math.ts`, tested in
`src/lib/scroll-math.test.ts`.

### Stack scene

- Wrapper height 2,600 px. Stage: `position: sticky; top: 0; height: min(100svh, 960px)`, with
  `100vh` as the fallback.
- Progress `p = clamp(-wrapperTop / (wrapperHeight - stageHeight), 0, 1)`.
- Isometric stack: 380 x 380 px,
  `transform: translateY(40px) rotateX(57deg) rotateZ(-42deg)`, `perspective: 2200px` on its
  wrapper, `transform-style: preserve-3d`.
- Plates rest at `translateZ` 0, 70 and 140 px. Radius 26 px. Each plate has two under-layers,
  at -10 px (Brick) and -20 px (Oxblood).
- Each plate drops from 560 px above its slot: `translateZ(rest + (1 - d) * 560px)`, with
  `opacity: d`.
- Easing: `d = 1 - (1 - t)^3` (ease-out cubic), where `t` is the progress inside the plate's
  segment, clamped to 0..1.
- Segments: Routes 0.04 to 0.28, Decks 0.36 to 0.60, Ops 0.68 to 0.92.
- Dashed ghost slots show where the plates will land. Their opacity is `(1 - d)` times 0.7,
  0.5 and 0.35.
- Active pill: 1 when `p < 0.33`, 2 when `p < 0.66`, otherwise 3.
- Clicking a pill smooth-scrolls to `p` = 0.22, 0.54 or 0.86.
- The pill description opens with `max-height` 0 to 120 px in 450 ms,
  `cubic-bezier(0.2, 0.8, 0.2, 1)`. The pill fill and radius change in 350 ms. Pill transitions
  stay off until the first update has run, so nothing animates on page load.

Values the unit tests check:

| p | d1 | d2 | d3 | Active pill |
| --- | --- | --- | --- | --- |
| 0.00 | 0 | 0 | 0 | 1 |
| 0.10 | 0.578 | 0 | 0 | 1 |
| 0.20 | 0.963 | 0 | 0 | 1 |
| 0.48 | 1 | 0.875 | 0 | 2 |
| 0.80 | 1 | 1 | 0.875 | 3 |
| 1.00 | 1 | 1 | 1 | 3 |

With a 2,600 px wrapper and a 900 px stage, `p` is 0.5 when the wrapper top is at -850 px and
1 at -1,700 px.

### Layer panels

- Routes, Decks and Ops sit in one wrapper. Each is `position: sticky; top: 0;
  height: min(100svh, 960px)`, so the next panel slides up and covers the one before. Panels
  pin only when the window is wider than 760 px and taller than 560 px.
- Cover progress for a panel: `c = clamp(1 - nextPanelTop / stageHeight, 0, 1)`.
- The covered panel's inner box gets `transform: scale(1 - c * 0.06)` from the top center,
  `border-radius: c * 28px`, and an overlay of `--dim` at opacity `c * 0.5`.
- The wrapper behind it is `--shell`, so the shrink shows as a frame.
- The incoming panel has `box-shadow: 0 -30px 60px var(--panel-shadow)`.
- Test value: when the next panel is 55% up a 900 px stage, `c` is 0.55.
- When keyboard focus moves into a panel that is covered, the page scrolls to that panel so
  the focused control is visible.

The hub uses the same panels, so it has the same cover motion.

### Hero

Over the hero's height, the spray tag moves up 140 px and the building image moves down 80 px.

### Reduced motion

With `prefers-reduced-motion: reduce`:

- Plates appear in place without the drop. `d` jumps from 0 to 1 as soon as the plate's
  segment starts.
- Panels do not shrink, round or dim. `--c1` and `--c2` stay at 0.
- The hero does not move. `--h` stays at 0.
- Pills switch with no transition, and clicking a pill jumps instead of smooth-scrolling.
- A global rule in `globals.css` cuts every other animation and transition to 0.01 ms.

Without JavaScript the plates rest in place and the panels stay uncovered, because those are
the default values of the variables in the CSS.

## 8. Themes

- Light is the default for every new visitor. The system color scheme setting is not used.
- The root layout renders `<html data-theme="light">`. `ThemeToggle` calls `switchTheme`, which
  flips `data-theme` on `<html>` between `light` and `dark` and writes the choice to a cookie
  named `penta-theme` (path `/`, one year, `SameSite=Lax`).
- No flash of the wrong theme on load. A short inline script in `<head>` reads the cookie and
  sets `data-theme="dark"` before the page paints.
- The toggle needs no React state. Both labels are in the markup and CSS shows the one for the
  other theme, so the button always names the theme it will switch to.
- `color-scheme` follows the theme, so browser controls and scrollbars match.

What changes with the theme: the color tokens in the first table of section 3, the building
image (`public/design/main-building-light.webp` or `main-building-dark.webp`, swapped by the
`.building-image` class) and the grain blend mode (`multiply` in light, `overlay` in dark).

What does not change: layout, type, sizes, motion, the parchment cards, gold, and slides. Text
that sits on the building image always has a fade of `--scrim-rgb` under it.

### Images

`public/design` holds three files.

| File | Use |
| --- | --- |
| `main-building-light.webp` | Duotone render of the PUP Main Building for the light theme. The sky is transparent so the spray tag shows behind the skyline. |
| `main-building-dark.webp` | The same render for the dark theme. |
| `grain.png` | Film grain tile, 220 x 220 px. |

## 9. Slides

Decks made in PENTA are drawn by `SlideRenderer`. A slide is a fixed canvas of 1600 x 900 px
(`slideLimits` in `src/lib/config.ts`). Blocks are placed in canvas pixels. To show a slide at
another size the whole canvas is scaled with one CSS transform, so a slide looks the same in
the editor, the viewer, the thumbnails and the PDF export.

### The slide palette does not follow the theme

A slide uses only tokens that are the same in light and dark, so a deck looks the same to
every viewer.

| Part | Token | Value |
| --- | --- | --- |
| Slide background | `--on-ink` | `#FCF7EC` |
| Text, outlines, arrows | `--ink` | `#2B0609` |
| Maroon text tone, maroon box | `--maroon` | `#800000` |
| Parchment box | `--card` | `#E4CC95` |
| Gold box | `--accent` | `#FFD700` |

### Block types

| Block | What it holds | Options |
| --- | --- | --- |
| `title` | One line of display text | Tone: `ink` or `maroon` |
| `text` | Body text, line breaks allowed | Tone: `ink` or `maroon` |
| `image` | An uploaded picture, fitted inside its frame, with alt text | None |
| `box` | A short centered label in a filled or outlined box | Fill: `none`, `ink`, `parchment`, `cream`, `maroon` or `gold` |
| `arrow` | A line with an arrow head | Direction: `right`, `left`, `up` or `down` |

Box fills: `none` and `cream` draw a 3 px ink outline. `ink` and `maroon` boxes use cream
text. Only one box per slide may be gold.

### The four layouts

A new slide starts from one of four layouts (`src/lib/slides/layouts.ts`).

| Layout | Blocks |
| --- | --- |
| Title | A title and one line of maroon text under it |
| Title and text | A title and a text block |
| Two columns | A title and two text blocks side by side |
| Three-box diagram | A maroon caption, three boxes joined by two arrows (the middle box filled ink), and a line of text |

### Type sizes on a slide

Sizes are in canvas pixels, before scaling.

| Block | Font | Size | Line-height |
| --- | --- | --- | --- |
| `title` | Big Shoulders 800, uppercase | 96 px | 0.92 |
| `text` | Inter 400 | 32 px | 1.4 |
| `box` | Big Shoulders 800, uppercase, centered | 44 px | 1.0 |

Arrows are drawn with a 6 px ink stroke and round ends.

## 10. Responsive rules

| Width or height | What changes |
| --- | --- |
| 1100 px and below | Hero: the side cards and counter hide. Stack: the layer counter and skip link hide, the stack scales to 0.8. Routes grid goes to 2 columns and shows two cards. Decks: the side column hides. Ops grid shows 3 items in 3 columns. Hub: the hero and Routes panel go to one column, class cards go to 2 columns. |
| 760 px and below | Side padding 20 px. Hero headline 84 px. The top bar labels hide. Pills become a wrapping row above the stack with no descriptions, the stack title is kept for screen readers only, and the stack scales to 0.58. Panels stop pinning and flow as normal sections, with no cover motion. Grids go to 1 column and show every item. The footer headline is 52 px. The app bar wraps. |
| Height 760 px and below, width above 760 px | Hero headline 128 px. Stack scale 0.82. |
| Height 560 px and below | Panels stop pinning at any width. |
| Below 900 px, slide editor only | The editing canvas and toolbar hide. The page shows a preview of the slide and a note to open the deck on a larger screen. |

There is no horizontal page scroll at any width. Wide tables, such as the gradebook, scroll
inside their own box.

## 11. Accessibility

- **Real elements.** Actions are `button`, links are `a href`, inputs are `input` inside a
  `label`. `Field` and `UploadDrop` wrap a native input.
- **Names.** The brand link has an `aria-label`. The theme toggle reads "Switch to dark theme"
  or "Switch to light theme" through visually hidden text. `ViewSwitch` is a labelled group
  with `aria-pressed` on each side. The active `IndexPill` has `aria-current` and its sentence
  is linked with `aria-describedby`.
- **Decoration is hidden.** Decorative SVG, the spray tag, the grain, the barcode bars, the
  plate stack and the layer counter are `aria-hidden`. The square brackets around labels are
  hidden too, so a label reads as its words.
- **Focus ring.** `:focus-visible` draws a 2 px outline in `--accent-mark` with a 4 px offset.
  On parchment cards the ring is `--ink`, and on an active pill it is `--fg-inv`, so it always
  contrasts with what is behind it.
- **Contrast.** Body text is at least 4.5 to 1. Large display text and marks are at least 3 to
  1. The pairs in section 3 are checked by a unit test in both themes.
- **Status is a word plus a shape.** A `StatusChip` always has text, and its dot is hollow,
  filled or gold by status. Errors start with the word "Error:". Late and missing work are
  written out.
- **Skip links.** The landing page starts with "Skip to the layers", which jumps past the
  stack scene to the Routes panel. Pages with the app bar start with "Skip to the page", which
  jumps to `main`. Both appear when focused.
- **Numbers read well.** `RouteCard` and `AltitudeMeter` give screen readers "Lesson 7 of 12"
  and "meters" in place of the short visual form.
- **Reduced motion.** See section 7. The page works the same with no motion.
- **Target size.** Controls have a hit area at least 44 px tall.

The style guide has Playwright checks in `e2e/styleguide.spec.ts`, run at 390 x 844 and
1440 x 900 in both themes. The theme switch is checked in `e2e/theme.spec.ts`, and the landing
page motion, with and without reduced motion, in `e2e/landing.spec.ts`.

## 12. Do not

- Do not add a nav bar with Routes, Decks and Ops buttons.
- Do not take over the scroll wheel or snap sections.
- Do not put per-frame values in component state. Write a CSS variable.
- Do not use gold for anything except LIVE, LATE and the one highlight box a teacher may place
  on a slide.
- Do not put raw hex colors in component styles. Use the tokens.
- Do not let a slide follow the theme. Slides use the fixed palette.
- Do not use color alone for a status. Add the word.
- Do not set long text in the display font.
- Do not add emoji or icon fonts.
