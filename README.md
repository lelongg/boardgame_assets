# Boardgame Asset Editor

File-backed web editor to create multiple games and card assets, with SVG previews and print sheets.

## Live Gallery

View the static gallery of all games and cards on [GitHub Pages](https://lelongg.github.io/boardgame_assets/).

## Setup

```bash
npm install
```

## Run the editor

```bash
npm run serve
```

Open `http://127.0.0.1:5173/`.

## Data layout

- Games live in `games/<game-id>/game.json`
- Cards live in `games/<game-id>/cards/<card-id>.json`

## Print sheets

Use the “Open Print Sheets” button in the UI or open:

```
http://127.0.0.1:5173/print/<game-id>
```

## Legacy build (optional)

The original SVG batch renderer still exists:

```bash
npm run build
```

Outputs to `output/` using `src/data/cards.ts`.

## GitHub Pages Build

To build the static site for GitHub Pages:

```bash
npm run build:pages
```

This generates a static gallery site in `docs/` with all games and cards. The GitHub Actions workflow automatically builds and deploys this on every push to the `main` branch.
