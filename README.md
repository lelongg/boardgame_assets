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

### Setup Google OAuth Client ID

1. **Create a Google Cloud Project**:
   - Go to [Google Cloud Console](https://console.cloud.google.com/)
   - Create a new project or select an existing one

2. **Enable the Google Drive API**:
   - Navigate to "APIs & Services" → "Library"
   - Search for "Google Drive API" and enable it

3. **Create OAuth 2.0 Client ID**:
   - Go to "APIs & Services" → "Credentials"
   - Click "Create Credentials" → "OAuth client ID"
   - Application type: "Web application"
   - Add authorized JavaScript origins:
     - `https://<username>.github.io` (replace with your GitHub username)
   - Add authorized redirect URIs:
     - `https://<username>.github.io/<repo-name>/editor/` (replace with your details)
   - Click "Create"
   - Copy the generated client ID (format: `XXXX-XXXX.apps.googleusercontent.com`)

4. **Set GitHub Actions Secret**:
   - Go to your repository Settings → Secrets and variables → Actions
   - Click "New repository secret"
   - Name: `GOOGLE_CLIENT_ID`
   - Value: Paste the OAuth client ID from step 3
   - Click "Add secret"

5. **Deploy to GitHub Pages**:
   - Push any commit to the `main` branch
   - The GitHub Actions workflow will automatically build and deploy
   - The editor will be available at `https://<username>.github.io/<repo-name>/editor/`

6. **Verify the deployment**:
   - Open the deployed editor URL
   - Click "Sign in with Google Drive"
   - If the setup is correct, you'll see the Google OAuth consent screen
   - After authorizing, you can create and edit games that are saved to your Google Drive

### Troubleshooting

**Error: "Google Drive is not configured. The GOOGLE_CLIENT_ID environment variable was not set during build."**

This error means the OAuth client ID wasn't properly injected during the build. To fix:

1. Verify the secret is set correctly in GitHub Actions:
   - Go to Settings → Secrets and variables → Actions
   - Ensure `GOOGLE_CLIENT_ID` exists and contains your OAuth client ID
   - The value should be 20+ characters, typically 60-80 characters ending in `.apps.googleusercontent.com`

2. Re-run the deployment:
   - Go to Actions tab
   - Find the "Deploy to GitHub Pages" workflow
   - Click "Re-run all jobs"
   - Check the build logs for "✓ Injected client ID" confirmation

3. Clear your browser cache:
   - The error might be from an old cached version
   - Hard refresh (Ctrl+Shift+R or Cmd+Shift+R)
   - Or open in incognito/private mode

**Optional**: Update `src/config.ts` to set a specific Drive `folderId` where all game data should be stored.

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
