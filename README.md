# Boardgame Asset Editor

Web editor to create multiple games and card assets, with SVG previews and print sheets.

Built with **React**, **TypeScript**, **Vite**, and **shadcn/ui**.

## Live Gallery

View the static gallery of all games and cards on [GitHub Pages](https://lelongg.github.io/boardgame_assets/).

## Setup

```bash
npm install
```

## Run the editor (Development)

The editor requires two servers running:

1. **Vite dev server** (React app):
```bash
npm run dev
```

2. **API server** (in a separate terminal):
```bash
npm run serve:api
```

Then open `http://localhost:5173/` in your browser.

## Tech Stack

- **React 19** with TypeScript
- **Vite** for fast development and building
- **shadcn/ui** components (built on Radix UI)
- **Tailwind CSS** for styling
- **React Router** for navigation

## Google Drive storage (hosted editor)

The editor can run as a static site and save data directly to Google Drive (no backend).

1. Create a Google OAuth client ID (see instructions in the repo docs/chat).
2. Set the GitHub Actions secret `GOOGLE_CLIENT_ID` (used during `build:pages` to inject the OAuth client ID).
3. Optional: update `src/config.ts` to set a Drive `folderId`.
4. Deploy to GitHub Pages (the editor is copied to `docs/editor/`).
5. Open the editor at `https://<user>.github.io/<repo>/editor/`.

To swap storage providers later, replace the storage implementation in `src/storage/` and update `src/storage.ts`.

## Data layout (local server)

- Games live in `games/<game-id>/game.json`
- Cards live in `games/<game-id>/cards/<card-id>.json`

## Print sheets

Use the "Print Sheets" button in the UI to open a printable grid.

## Legacy build (optional)

The original SVG batch renderer still exists:

```bash
npm run build:legacy
```

Outputs to `output/` using `src/data/cards.ts`.

## GitHub Pages Build

To build the static site for GitHub Pages:

```bash
npm run build:pages
```

This generates a static gallery site in `docs/` with all games and cards, plus a copy of the editor in `docs/editor/`. The GitHub Actions workflow automatically builds and deploys this on every push to the `main` branch.

### Enabling GitHub Pages

To enable GitHub Pages for this repository:
1. Go to repository Settings → Pages
2. Under "Build and deployment", set Source to "GitHub Actions"
3. The workflow will automatically deploy on the next push to `main`
