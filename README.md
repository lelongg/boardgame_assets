# Boardgame Asset Editor

Web editor to create multiple games and card assets, with SVG previews and print sheets.

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

## Google Drive storage (hosted editor)

The editor can run as a static site and save data directly to Google Drive (no backend).

1. Create a Google OAuth client ID (see instructions in the repo docs/chat).
2. Update `src/web/config.js`:
   - Set `storage.googleDrive.clientId`
   - Optional: set `storage.googleDrive.folderId` to save into a specific Drive folder
3. Deploy to GitHub Pages (the editor is copied to `docs/editor/`).
4. Open the editor at `https://<user>.github.io/<repo>/editor/`.

To swap storage providers later, replace `src/web/storage/googleDrive.js` and update `src/web/storage.js` to point at the new provider.

## Data layout (local server)

- Games live in `games/<game-id>/game.json`
- Cards live in `games/<game-id>/cards/<card-id>.json`

## Print sheets

Use the “Print Sheets” button in the UI to open a printable grid.

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

This generates a static gallery site in `docs/` with all games and cards, plus a copy of the editor in `docs/editor/`. The GitHub Actions workflow automatically builds and deploys this on every push to the `main` branch.

### Enabling GitHub Pages

To enable GitHub Pages for this repository:
1. Go to repository Settings → Pages
2. Under "Build and deployment", set Source to "GitHub Actions"
3. The workflow will automatically deploy on the next push to `main`
