# Basketball Scoreboard

A retro red-LCD basketball scoreboard for training sessions. Plain HTML/CSS/JS —
no build step, no dependencies. Works on a phone in both portrait and landscape.

## Features

- **Setup before tip-off** — period length, both team colors (red / green / black / white,
  defaults to red vs black), and an optional target score.
- **Seven-segment red LCD** display, drawn in CSS (no font or image files).
- **Clock** counts down MM:SS, switches to seconds + tenths in the final minute.
  Start/pause with the big button or by tapping the clock itself (Space on a keyboard).
- **Scoring** — +1 / +2 / +3 per team, with matching −1 / −2 / −3 to undo mistakes.
- **End of period** — buzzer plus a flashing display when time runs out or a team
  reaches the target. Dropping a team back below the target resumes the game.
- Settings are remembered between visits; the screen is kept awake while the clock runs.

## Controls

| Control | What it does |
| --- | --- |
| Clock / `START` / Space | Start or pause the clock |
| `+1 +2 +3` | Add points to that team |
| `−1 −2 −3` | Take points back off |
| `RESET` | Clock back to full, both scores to 0 |
| `SND` | Mute or unmute the buzzer |
| `FULL` | Fullscreen (not supported by iOS Safari) |
| `SETUP` | Back to the setup screen |

## Run it locally

Any static file server works:

```bash
python3 -m http.server 4173
```

Then open <http://localhost:4173>.

## Publish on GitHub Pages

Push to `main`, then in the repository go to **Settings → Pages** and set
**Source** to *Deploy from a branch*, branch `main`, folder `/ (root)`.
The board is then live at `https://<user>.github.io/basketball-scoreboard/`.

On a phone, use the browser's **Add to Home Screen** to launch it without the
address bar.
