# Stage 0 Reveal

Offline broadcast package for Stage 0 (Zero Vector Philippines): a state-broadcast style announcement show that reveals the advancing teams one by one and ends with a shuffled order of presentation, plus a presentation timer bar. Both pages are single self-contained HTML files with the Michroma font embedded, so they run from `file://` with no network and no extra files.

## Files

- `index.html`: the announcement show (setup screen, intro, one-by-one reveal, final order).
- `timer.html`: the presentation timer bar for the bottom of the screen.

## Running the show

1. Open `index.html` in Chrome, or add it to OBS as a browser source (settings below).
2. Fill in the setup screen:
   - Header text, for example `ROUND 1 PRESENTERS` or `ROUND 2 FINALISTS`.
   - Theme: Blue (cold steel and cyan) or Red (crimson and ember).
   - Team names, one per line, 1 to 16 teams. Blank lines are ignored and the live count updates as you type.
   - Seconds per team (3 to 10, default 5): how long each name holds before the next one.
   - Master volume, with a Test sound button to check the audio route.
3. Click START. Audio starts on that click (browser autoplay rules). Everything after that is automatic:
   - Intro: black, the drone fades in, the header assembles in metallic type with an impact hit.
   - Reveal: teams appear one by one in the exact order typed, each with a tension rise, a clang and a boom, a flash and a camera shake, then a dissolve into particles.
   - Final list: a riser and a bigger hit, the header morphs into `ORDER OF PRESENTATION`, and all teams land on numbered plates in a fresh random order (independent of the typed order, shuffled with `crypto.getRandomValues`).

The last setup is remembered in the browser, so the next launch starts with the same header, theme, teams and settings.

### Keys during the show

Nothing is shown on screen for these.

| Key | Action |
| --- | --- |
| Space | Pause or resume the auto-advance |
| Right arrow | Skip to the next team |
| C | Copy the final order to the clipboard as `1. Team A`, `2. Team B`, ... and show a small toast |
| Esc | Back to the setup screen |
| F | Toggle fullscreen |
| Shift+R | Reshuffle the final order (asks for confirmation first) |

The final order is also printed to the browser console.

### Fast test mode

`index.html?test=1` shortens the intro and holds each team for 1 second. The setup screen can also be prefilled from the URL: `header=`, `theme=blue|red`, `seconds=` and `teams=` (names separated by `|` or `,`).

```
index.html?test=1&theme=red&header=ROUND%202%20FINALISTS&teams=Team%20A|Team%20B|Team%20C
```

## Timer

One file covers every round; the minutes come from the URL.

```
Round 1, 3 min pitch + 4 min Q&A:  timer.html?min=3&qa=4&theme=blue
Round 2, 6 min pitch:              timer.html?min=6&theme=red
```

Add `&qa=<minutes>` to the Round 2 URL if the finals also get a Q&A block.

| Param | Meaning | Default |
| --- | --- | --- |
| `min` | Presentation minutes | `3` |
| `qa` | Q&A minutes, counted down after the presentation | none |
| `theme` | `blue` or `red` | `blue` |
| `label` | Text on the left | `PRESENTATION` |

- Counts down as soon as the page loads. OBS reloads the page every time the scene becomes active, which restarts it.
- Big `mm:ss` in the centre, label on the left, the next segment on the right, a thin progress bar along the bottom edge.
- Under 30 s the bar turns amber. Under 10 s it turns red and pulses.
- At 0:00 with `qa` set, the label switches to `Q&A` and the Q&A minutes count down. When there is no Q&A, or when the Q&A also ends, the centre shows `TIME` flashing red.
- Keys: Space pauses or resumes (a small PAUSED chip appears next to the label), R restarts from the beginning. Click the page once first so it has keyboard focus; in OBS use the Interact window.
- No sound.

## OBS browser source settings

### Show (`index.html`)

- Add a Browser source.
- Tick **Local file** and choose `index.html` from this folder.
- Width `1920`, height `1080`.
- Tick **Control audio via OBS** so the generated sound goes through the OBS mixer.
- Right-click the source and choose **Interact** to fill in the setup screen, click START and use the keys above.

### Timer (`timer.html`)

- Add a Browser source and leave **Local file** unticked.
- URL, with the real path to this folder, for example:

```
file:///Users/<me>/Desktop/stage0-reveal/timer.html?min=3&qa=4&theme=blue
file:///Users/<me>/Desktop/stage0-reveal/timer.html?min=6&theme=red
```

Make one Browser source per round, or edit the `min` and `qa` values between rounds.

- Width `1920`, height `120`.
- Tick **Refresh browser when scene becomes active** so every presenter starts from a full timer.
- Place it along the bottom edge of the scene, under the presentation.

To get a `file://` URL on a Mac, right-click the file in Finder, hold Option and choose **Copy "timer.html" as Pathname**, then put `file://` in front of it.
