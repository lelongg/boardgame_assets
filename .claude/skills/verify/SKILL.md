---
name: verify
description: How to build, launch, and drive this app to verify changes end-to-end.
---

# Verifying changes in boardgame_assets

## Build & launch

- `npm ci` if node_modules is missing.
- The web app needs BOTH servers:
  - API: `npm run serve:api` (tsx src/server.ts on port 5174; stores data in `data/`, gitignored)
  - Front: `npm run dev` (vite; check the log for the actual port — it picks the next free one, e.g. 5180)
  - Vite proxies `/api` to `localhost:5174`. Without the API server the default `localFile` storage backend 500s.
- A demo game is seeded automatically: game id `classic-card-deck`, collection `default`.

## Driving the UI (Playwright)

- Use `playwright-core` with `executablePath: '/opt/pw-browsers/chromium'`; mobile testing works with `devices['Pixel 7']`.
- Layout editor URL: `/game/classic-card-deck/collection/default`, then click the `Front` tab (it is NOT a role=button — use `getByText('Front', { exact: true })`).
- Select an item in the node tree (e.g. `getByText('Rank').first()`), then property pill buttons appear (Name, Width, Offset X, ...). Clicking a pill opens its editor (NumberEditor, color picker, etc.).
- The card/layout preview is an `<img>` with a blob URL of the rendered SVG. To assert on the SVG output, in page context find the last blob `img` and `fetch(img.src).then(r => r.text())`.

## Tests

`npm test` runs all node:test suites via tsx (needs no servers; it starts its own). The S3 mock suite is occasionally flaky — re-run before blaming a change.
