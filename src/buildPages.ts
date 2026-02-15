import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { renderCardSvg, renderTemplateSvg } from "./render/cardSvg.js";
import { defaultTemplate } from "./template.js";
import { theme } from "./theme.js";
import { normalizeCard, normalizeTemplate } from "./normalize.js";
import type { CardData, CardTemplate } from "./types.js";

const docsDir = path.resolve("docs");
const gamesDir = path.resolve("games");
const distDir = path.resolve("dist");
const editorDir = path.join(docsDir, "editor");

// Clean and create docs directory
if (fs.existsSync(docsDir)) {
  fs.rmSync(docsDir, { recursive: true, force: true });
}
fs.mkdirSync(docsDir, { recursive: true });

// Build React app with Vite
console.log("Building React app...");
execSync("npm run build", { stdio: "inherit" });

// Inject Google OAuth client ID into built files
const googleClientId = (process.env.GOOGLE_CLIENT_ID || "").trim();

// Validate the client ID
if (googleClientId && googleClientId !== "YOUR_GOOGLE_CLIENT_ID") {
  // Basic validation: Google OAuth client IDs are typically long strings ending in .apps.googleusercontent.com
  const looksValid = googleClientId.length > 20 && 
                     (googleClientId.endsWith('.apps.googleusercontent.com') || 
                      googleClientId.includes('-'));
  
  if (!looksValid) {
    console.error("\n❌ ERROR: GOOGLE_CLIENT_ID appears to be invalid!");
    console.error(`   Client ID length: ${googleClientId.length} characters`);
    console.error(`   Expected format: XXXX-XXXX.apps.googleusercontent.com`);
    console.error("   Please check that the secret is set correctly in GitHub Actions.\n");
    process.exit(1);
  }
  
  console.log("Injecting Google OAuth client ID...");
  console.log(`  Client ID: ${googleClientId.substring(0, 20)}...${googleClientId.substring(googleClientId.length - 20)} (${googleClientId.length} chars)`);
  
  const assetsDir = path.join(distDir, "assets");
  
  // Verify assets directory exists
  if (!fs.existsSync(assetsDir)) {
    console.error("❌ ERROR: assets directory not found. Cannot inject client ID.");
    console.error("   This indicates the Vite build failed or produced unexpected output.");
    process.exit(1);
  }
  
  const jsFiles = fs.readdirSync(assetsDir).filter(f => f.endsWith(".js"));
  let injectedCount = 0;
  
  for (const jsFile of jsFiles) {
    const filePath = path.join(assetsDir, jsFile);
    let content = fs.readFileSync(filePath, "utf8");
    const originalContent = content;
    
    // Replace the placeholder with the actual client ID
    content = content.replace(/YOUR_GOOGLE_CLIENT_ID/g, googleClientId);
    
    // Only write if content changed
    if (content !== originalContent) {
      fs.writeFileSync(filePath, content, "utf8");
      const replacementCount = (originalContent.match(/YOUR_GOOGLE_CLIENT_ID/g) || []).length;
      console.log(`  ✓ Injected client ID into ${jsFile} (${replacementCount} replacement${replacementCount !== 1 ? 's' : ''})`);
      injectedCount++;
    }
  }
  
  if (injectedCount === 0) {
    console.error("\n❌ ERROR: No files were modified during client ID injection!");
    console.error("   The placeholder 'YOUR_GOOGLE_CLIENT_ID' was not found in any built files.");
    console.error("   This could indicate a build configuration issue.");
    process.exit(1);
  }
  
  console.log(`  ✓ Successfully injected client ID into ${injectedCount} file${injectedCount !== 1 ? 's' : ''}\n`);
} else {
  console.warn("\n⚠️  WARNING: GOOGLE_CLIENT_ID environment variable not set!");
  console.warn("   Google Drive integration will not work in the deployed editor.");
  console.warn("   To fix this:");
  console.warn("   1. Go to GitHub repository Settings > Secrets and variables > Actions");
  console.warn("   2. Add a new secret named 'GOOGLE_CLIENT_ID' with your OAuth client ID");
  console.warn("   3. Re-run the deployment workflow\n");
}

// Copy Vite build output to docs/editor
const copyDir = (source: string, target: string) => {
  fs.mkdirSync(target, { recursive: true });
  fs.readdirSync(source, { withFileTypes: true }).forEach((entry) => {
    const sourcePath = path.join(source, entry.name);
    const targetPath = path.join(target, entry.name);
    if (entry.isDirectory()) {
      copyDir(sourcePath, targetPath);
      return;
    }
    fs.copyFileSync(sourcePath, targetPath);
  });
};

console.log("Copying React app to docs/editor/...");
copyDir(distDir, editorDir);

// Copy favicon to docs root and editor directories
const publicDir = path.resolve("public");
const faviconPath = path.join(publicDir, "favicon.svg");
if (fs.existsSync(faviconPath)) {
  fs.copyFileSync(faviconPath, path.join(docsDir, "favicon.svg"));
  fs.copyFileSync(faviconPath, path.join(editorDir, "favicon.svg"));
  console.log("Copied favicon to docs/ and docs/editor/");
}

// Create 404.html for GitHub Pages SPA routing
// This redirects all 404s under /editor/ to the React app
const notFoundHtml = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta http-equiv="refresh" content="0;url=/boardgame_assets/editor/" />
    <title>Redirecting...</title>
    <script>
      // Store the path for the React app to handle
      sessionStorage.setItem('redirectPath', window.location.pathname);
      window.location.href = '/boardgame_assets/editor/';
    </script>
  </head>
  <body>
    <p>Redirecting to editor...</p>
  </body>
</html>`;

fs.writeFileSync(path.join(editorDir, "404.html"), notFoundHtml, "utf8");

type GameMeta = {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
};

const readJson = <T>(filePath: string, fallback: T): T => {
  if (!fs.existsSync(filePath)) return fallback;
  const data = fs.readFileSync(filePath, "utf8");
  return JSON.parse(data) as T;
};

const escapeHtml = (text: string): string => {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
};

const gamePath = (gameId: string) => path.join(gamesDir, gameId, "game.json");
const templatePath = (gameId: string) => path.join(gamesDir, gameId, "template.json");
const cardsDir = (gameId: string) => path.join(gamesDir, gameId, "cards");

const listGames = (): GameMeta[] => {
  if (!fs.existsSync(gamesDir)) return [];
  return fs
    .readdirSync(gamesDir, { withFileTypes: true })
    .filter((dir) => dir.isDirectory())
    .map((dir) => readJson<GameMeta | null>(gamePath(dir.name), null))
    .filter(Boolean) as GameMeta[];
};

const listCards = (gameId: string): CardData[] => {
  const dir = cardsDir(gameId);
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((file) => file.endsWith(".json"))
    .map((file) => normalizeCard(readJson<unknown>(path.join(dir, file), null)))
    .filter(Boolean) as CardData[];
};

const loadTemplate = (gameId: string): CardTemplate => {
  const fallback = defaultTemplate();
  if (!fs.existsSync(templatePath(gameId))) return fallback;
  const raw = readJson<unknown>(templatePath(gameId), null);
  if (!raw || (typeof raw === "object" && (raw as any).version !== 2)) return fallback;
  return normalizeTemplate(raw);
};

// Build index page
const games = listGames();

const indexHtml = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Boardgame Asset Gallery</title>
    <link rel="icon" type="image/svg+xml" href="/boardgame_assets/favicon.svg" />
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=Fraunces:wght@500;700&family=Space+Grotesk:wght@400;500;600&display=swap" rel="stylesheet" />
    <style>
      :root {
        --paper: ${theme.palette.paper};
        --ink: ${theme.palette.ink};
        --muted: ${theme.palette.muted};
        --primary: #7c5d3f;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        font-family: 'Space Grotesk', sans-serif;
        color: var(--ink);
        background: #f4efe6;
        min-height: 100vh;
      }
      header {
        padding: 48px 24px 24px;
        text-align: center;
        background: linear-gradient(135deg, #fffaf2 0%, #f4efe6 100%);
        border-bottom: 2px solid #e8dcc8;
      }
      header h1 {
        font-family: 'Fraunces', serif;
        font-size: 48px;
        margin: 0 0 12px;
        color: var(--primary);
      }
      header p {
        margin: 0;
        color: var(--muted);
        font-size: 18px;
      }
      main {
        max-width: 1200px;
        margin: 0 auto;
        padding: 48px 24px;
      }
      .games-grid {
        display: grid;
        gap: 24px;
        grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
      }
      .game-card {
        background: white;
        border-radius: 16px;
        padding: 24px;
        box-shadow: 0 4px 12px rgba(30, 20, 10, 0.08);
        transition: transform 0.2s, box-shadow 0.2s;
        text-decoration: none;
        color: inherit;
        display: block;
      }
      .game-card:hover {
        transform: translateY(-4px);
        box-shadow: 0 8px 24px rgba(30, 20, 10, 0.15);
      }
      .game-card h2 {
        margin: 0 0 8px;
        font-size: 24px;
        color: var(--primary);
      }
      .game-card p {
        margin: 0;
        color: var(--muted);
        font-size: 14px;
      }
      .empty {
        text-align: center;
        color: var(--muted);
        font-size: 18px;
        padding: 48px;
      }
      footer {
        text-align: center;
        padding: 48px 24px;
        color: var(--muted);
        font-size: 14px;
      }
      .editor-link {
        text-align: center;
        padding: 0 24px 24px;
      }
      .editor-link a {
        display: inline-block;
        padding: 12px 28px;
        background: var(--primary);
        color: white;
        text-decoration: none;
        border-radius: 12px;
        font-weight: 600;
        font-size: 16px;
        transition: all 0.2s;
        box-shadow: 0 2px 8px rgba(124, 93, 63, 0.2);
      }
      .editor-link a:hover {
        background: #6a4d35;
        transform: translateY(-1px);
        box-shadow: 0 4px 12px rgba(124, 93, 63, 0.3);
      }
    </style>
  </head>
  <body>
    <header>
      <h1>Boardgame Asset Gallery</h1>
      <p>Static gallery of boardgame assets • ${games.length} game${games.length !== 1 ? 's' : ''}</p>
    </header>
    <div class="editor-link">
      <a href="editor/">Open Asset Editor</a>
    </div>
    <main>
      ${games.length === 0 ? '<p class="empty">No games found. Add games to the repository to see them here.</p>' : `
      <div class="games-grid">
        ${games.map(game => `
        <a href="${escapeHtml(game.id)}/index.html" class="game-card">
          <h2>${escapeHtml(game.name)}</h2>
          <p>View cards →</p>
        </a>
        `).join('')}
      </div>
      `}
    </main>
    <footer>
      <p>Built with Boardgame Asset Editor</p>
    </footer>
  </body>
</html>`;

fs.writeFileSync(path.join(docsDir, "index.html"), indexHtml, "utf8");

// Build game pages
let totalCards = 0;

for (const game of games) {
  const gameDocsDir = path.join(docsDir, game.id);
  fs.mkdirSync(gameDocsDir, { recursive: true });

  const cards = listCards(game.id);
  const template = loadTemplate(game.id);

  totalCards += cards.length;

  // Generate SVG files for each card
  for (const card of cards) {
    const svg = renderCardSvg(card, template);
    const fileName = `${card.id}.svg`;
    fs.writeFileSync(path.join(gameDocsDir, fileName), svg, "utf8");
  }

  // Generate template preview
  const templateSvg = renderTemplateSvg(template);
  fs.writeFileSync(path.join(gameDocsDir, "template.svg"), templateSvg, "utf8");

  // Generate game page
  const gameHtml = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(game.name)} - Boardgame Assets</title>
    <link rel="icon" type="image/svg+xml" href="/boardgame_assets/favicon.svg" />
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=Fraunces:wght@500;700&family=Space+Grotesk:wght@400;500;600&display=swap" rel="stylesheet" />
    <style>
      :root {
        --paper: ${theme.palette.paper};
        --ink: ${theme.palette.ink};
        --muted: ${theme.palette.muted};
        --primary: #7c5d3f;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        font-family: 'Space Grotesk', sans-serif;
        color: var(--ink);
        background: #f4efe6;
        min-height: 100vh;
      }
      header {
        padding: 32px 24px 16px;
        background: linear-gradient(135deg, #fffaf2 0%, #f4efe6 100%);
        border-bottom: 2px solid #e8dcc8;
      }
      .nav {
        margin-bottom: 16px;
      }
      .nav a {
        color: var(--primary);
        text-decoration: none;
        font-size: 14px;
      }
      .nav a:hover {
        text-decoration: underline;
      }
      header h1 {
        font-family: 'Fraunces', serif;
        font-size: 36px;
        margin: 0 0 8px;
        color: var(--primary);
      }
      header p {
        margin: 0;
        color: var(--muted);
      }
      main {
        max-width: 1400px;
        margin: 0 auto;
        padding: 32px 24px;
      }
      .cards-grid {
        display: grid;
        gap: 24px;
        grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
      }
      .card {
        background: white;
        border-radius: 16px;
        padding: 16px;
        box-shadow: 0 4px 12px rgba(30, 20, 10, 0.08);
        transition: transform 0.2s, box-shadow 0.2s;
      }
      .card:hover {
        transform: translateY(-2px);
        box-shadow: 0 6px 16px rgba(30, 20, 10, 0.12);
      }
      .card h3 {
        margin: 0 0 12px;
        font-size: 16px;
        color: var(--primary);
      }
      .card img {
        width: 100%;
        height: auto;
        display: block;
        border-radius: 8px;
      }
      .empty {
        text-align: center;
        color: var(--muted);
        font-size: 18px;
        padding: 48px;
      }
      .print-button {
        margin-top: 24px;
        text-align: center;
      }
      .print-button a {
        display: inline-block;
        padding: 12px 24px;
        background: var(--primary);
        color: white;
        text-decoration: none;
        border-radius: 8px;
        font-weight: 500;
        transition: background 0.2s;
      }
      .print-button a:hover {
        background: #6a4d35;
      }
    </style>
  </head>
  <body>
    <header>
      <div class="nav">
        <a href="../index.html">← Back to games</a>
      </div>
      <h1>${escapeHtml(game.name)}</h1>
      <p>${cards.length} card${cards.length !== 1 ? 's' : ''}</p>
    </header>
    <main>
      ${cards.length === 0 ? '<p class="empty">No cards in this game yet.</p>' : `
      <div class="cards-grid">
        ${cards.map(card => `
        <div class="card">
          <h3>${escapeHtml(card.name)}</h3>
          <img src="${escapeHtml(card.id)}.svg" alt="${escapeHtml(card.name)}" />
        </div>
        `).join('')}
      </div>
      <div class="print-button">
        <a href="print.html">Open Print Sheet</a>
      </div>
      `}
    </main>
  </body>
</html>`;

  fs.writeFileSync(path.join(gameDocsDir, "index.html"), gameHtml, "utf8");

  // Generate print sheet
  const printHtml = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Print Sheet - ${escapeHtml(game.name)}</title>
    <link rel="icon" type="image/svg+xml" href="/boardgame_assets/favicon.svg" />
    <style>
      @page { margin: 10mm; }
      body {
        margin: 0;
        font-family: "Space Grotesk", sans-serif;
        background: #f4efe6;
        color: #1b1a17;
      }
      header {
        padding: 16px 18px 6px;
      }
      h1 { margin: 0; font-size: 20px; }
      .sheet {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 12px;
        padding: 12px;
      }
      .sheet-card {
        background: #fffaf2;
        border: 1px solid #d7cdbd;
        border-radius: 12px;
        padding: 6px;
        break-inside: avoid;
      }
      .sheet-card img {
        width: 100%;
        display: block;
      }
      @media print {
        header { display: none; }
        body { background: white; }
      }
    </style>
  </head>
  <body>
    <header>
      <h1>Print Sheet — ${escapeHtml(game.name)}</h1>
      <p>Use your browser print dialog.</p>
    </header>
    <section class="sheet">
      ${cards.map(card => `
      <div class="sheet-card"><img src="${escapeHtml(card.id)}.svg" alt="${escapeHtml(card.name)}" /></div>
      `).join('')}
    </section>
  </body>
</html>`;

  fs.writeFileSync(path.join(gameDocsDir, "print.html"), printHtml, "utf8");
}

console.log(`✓ Built static site to docs/`);
console.log(`  ${games.length} game${games.length !== 1 ? 's' : ''}, ${totalCards} card${totalCards !== 1 ? 's' : ''}`);
