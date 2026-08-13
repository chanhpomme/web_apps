# web_apps

Small self-contained web apps, published with GitHub Pages.
No build step, no dependencies — every app is plain HTML/CSS/JS.

| App | Description |
| --- | --- |
| [basketball-scoreboard](basketball-scoreboard/) | Retro red-LCD basketball scoreboard for training sessions. |

## Run locally

```bash
python3 -m http.server 4173
```

Then open <http://localhost:4173>.

## Publish

Push to `main`, then in **Settings → Pages** set **Source** to *Deploy from a branch*,
branch `main`, folder `/ (root)`. The index is then live at
`https://chanhpomme.github.io/web_apps/`, and each app at
`https://chanhpomme.github.io/web_apps/<app-name>/`.
