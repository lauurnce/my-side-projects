# Test Report

This report says what is tested in PENTA, how to run each suite, and what the latest full run
returned. The run below was made on 2026-11-28 on a laptop against the local Supabase stack.

## Summary

| Suite | Command | What it runs on | Files | Tests | Result |
| --- | --- | --- | --- | --- | --- |
| Unit and component | `npm run test` | jsdom, no database | 137 | 2,246 | all pass |
| Database and RLS | `npm run test:db` | the local Supabase stack | 37 | 1,062 | all pass |
| End to end | `npm run e2e` | a production build, Chromium and WebKit | 13 | 126 | all pass |

`npm run verify` runs the typecheck, the linter, the unit suite and a production build in one
command. It finished with 0 type errors and 0 lint errors. The linter reports 3 warnings, all the
same rule (`@next/next/no-img-element`): two in the style guide page and one in the slide renderer,
where a plain `<img>` is used on purpose for images served by the app's own access-checked route.

`npm audit` reports 0 vulnerabilities.

## How to run the suites

```bash
npm run verify     # typecheck, lint, unit tests, production build
npm run test:db    # needs the local Supabase stack
npm run e2e        # needs the local Supabase stack; builds and starts the app on port 3100
```

The database and end to end suites refuse to run against anything that is not a local address.
They create their own accounts ending in `@penta.test` and remove them afterwards. They do not
depend on the demo data, but `npm run demo:reset` gives a clean start if a run was interrupted.

Continuous integration runs `npm run verify` on every push and pull request that touches `penta/`.
It does not run the database or end to end suites, because those need the local stack.

## Unit and component tests

2,246 tests in 137 files under `src/`. They cover pure logic and React components with mocked
server calls.

| Area | What is checked |
| --- | --- |
| Input schemas (`src/app/**/**-schema.test.ts`) | Every server boundary: sign-up and login, classes and lessons, deck uploads, quiz builder, quiz attempts, hand-ins, grading, threads, the slide editor. Each refusal maps to its own sentence, and an unknown answer never passes through. |
| Server actions | Each action checks the session itself. Saving a slide deck uses the signed-in teacher, not an id the caller names. Thread and lesson forms keep the typed text when the session has ended. |
| The proxy (`src/proxy.test.ts`) | Guarded paths redirect a visitor to login with the path kept, server action requests are let through to answer for themselves, and an Auth outage answers 503. |
| Security headers | The content security policy allows the app, the Supabase project and the pdf.js worker, and nothing else. |
| Routes | Lesson rules, progress and altitude maths, join code format. |
| Decks | File checks by extension, MIME type and magic bytes, the viewer with a faked pdf.js, range reading with signed URL refresh, seen-slide tracking, the live follower and presenter state machines. |
| Slide editor | The content schema (malformed content, script text, remote image addresses, hidden characters, size), the reducer with undo and redo, the four layouts, frame maths, autosave with retries and conflicts, image header checks, the renderer, the canvas, the slide list and the toolbar. |
| Ops | Quiz scoring views, the answer save queue, the countdown, hand-in file checks, gradebook and CSV. |
| Threads | Text rules, live sync, moderation controls. |
| Design | Scroll maths for the landing page against measured values, token contrast in both themes, every shared component. |

## Database and RLS tests

1,062 tests in 37 files under `tests/db/`. Each test signs in as a real user through the API with
that user's own token, so Row Level Security and function grants are exercised as the browser
would exercise them.

| Area | What is checked |
| --- | --- |
| Accounts | Sign-up, the role on the profile, what a user can read about others. |
| Classes and enrollment | Join codes, wrong-code lockout, removing a student, another teacher's class. |
| Modules, lessons, progress | Drafts stay hidden from students, reordering, marking a lesson done. |
| Decks | Reserving, completing and sweeping uploads, the storage budget, view tracking, the bucket rules. |
| Decks made in the editor | Content is hidden until published, saving with a stale version answers conflict, a repeated save is accepted once, saving is refused while the deck is live, an image that is not stored for the deck is refused. |
| Live sessions | Start, move, end, the lease, who may read the state, and who may join the private channel. |
| Quizzes | The builder, answer keys that no API role can read, attempts, the time limit, grading, when answers are revealed. |
| Hand-ins and grading | Reserve, complete, late flag, grading, the grade log, removing graded files, a student who left the class. |
| Grades and altitude | The gradebook, a student's own grades, altitude across lessons, decks and graded work. |
| Threads | Asking, replying, editing, hiding, locking, rate limits, places per lesson and per thread, the private channel. |

## End to end tests

126 tests: 63 per browser, in 13 spec files under `e2e/`. Playwright builds the app, starts it, and
drives Chromium and WebKit.

| Spec | Tests per browser | What it does |
| --- | --- | --- |
| `landing.spec.ts` | 21 | The landing page: structure, the scroll-driven stack and panels, reduced motion, both themes, an accessibility scan. |
| `styleguide.spec.ts` | 20 | Every shared component in both themes: sizes, hit areas, focus rings, fonts, an accessibility scan. |
| `accounts.spec.ts` | 7 | Sign-up as student and teacher, the teacher code, login, logout, guarded pages. |
| `theme.spec.ts` | 5 | Light by default, the switch, no flash of the wrong theme. |
| `full.spec.ts` | 2 | The whole journey, once in light and once in dark. See below. |
| `routes.spec.ts` | 1 | A class from creation to a student finishing a lesson, with an accessibility scan. |
| `decks.spec.ts` | 1 | Upload a deck, flip through it as a student, an outsider gets 404. |
| `live.spec.ts` | 1 | A student follows a live deck, browses freely, jumps back and survives going offline. |
| `slides.spec.ts` | 1 | Build a deck in the editor, reorder it, publish, present live, a student follows, export page. |
| `quiz.spec.ts` | 1 | Build a quiz, take it, see the result. |
| `uploads.spec.ts` | 1 | Hand in a file, grade it, the gradebook and the CSV export. |
| `threads.spec.ts` | 1 | Two students ask and reply live, the teacher hides and locks. |
| `home.spec.ts` | 1 | The home page loads and shows its heading. |

### The full journey

`full.spec.ts` goes through the app as a real teacher and a real student, in the light theme and
again in the dark theme.

- Teacher: creates a class, adds a module and a lesson and publishes it, uploads a deck, starts a
  live session, builds and publishes a quiz, creates a hand-in activity, grades the hand-in, and
  replies in a thread.
- Student: joins with the join code, reads the lesson and marks it done, views the deck, follows
  the live session, takes the quiz, hands in a file, sees the grade and a higher altitude, and asks
  a question in a thread.

Along the way it also checks:

- no accessibility violations on the teacher's class page, the quiz builder, the student's hub and
  the student's class page;
- a visible focus ring on a class card;
- that a thread reply typed after the session ended stays in the field with the message "Your
  session ended";
- that a failed request shows the error page with Try again;
- that an unknown deck address answers 404 with the not-found page, in the right theme;
- that neither browser reported an uncaught page error.

## Accessibility scans

Automated scans use axe with the WCAG 2.1 A and AA rules.

| Where | Scope | Result |
| --- | --- | --- |
| End to end suite | Landing page and style guide in both themes, a student's route, and the four screens in the full journey in both themes | 0 violations |
| One-off review scan on 2026-11-28 | 29 screens in both themes (58 scans): public pages, hub, classes, lessons, decks, the slide editor, quizzes, hand-ins, grades and threads, as teacher and as student | 1 rule failed on 2 teacher screens (button names that split the visible words). Fixed, and now covered by the full journey. |

The same review walked the student and teacher paths with the keyboard only and found one hidden
focus ring on class cards, which is fixed and tested.

## What is not covered by automated tests

- A real screen reader. Names and live regions are checked from the accessibility tree.
- Safari and Firefox on real devices, and real phones. WebKit stands in for Safari.
- Printing a slide deck to PDF from the browser's print dialog, beyond the print page rendering.
- Email, because local sign-up needs no confirmation.
- Load: many students in one live session, or a class at its size limits.
- The deployed site. Use [QA-CHECKLIST.md](QA-CHECKLIST.md) for a manual pass there.
