import fs from "node:fs";
import path from "node:path";
import { cards } from "./data/cards.js";
import { renderCardSvg } from "./render/cardSvg.js";
import { defaultTemplate } from "./template.js";
import { theme } from "./theme.js";

const outputDir = path.resolve("output");
fs.mkdirSync(outputDir, { recursive: true });

const cardFiles: { id: string; file: string }[] = [];

const template = defaultTemplate();

for (const card of cards) {
  const svg = renderCardSvg(card, template);
  const fileName = `${card.id}.svg`;
  fs.writeFileSync(path.join(outputDir, fileName), svg, "utf8");
  cardFiles.push({ id: card.id, file: fileName });
}

const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Boardgame Assets</title>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=Cinzel:wght@500;700&family=Crimson+Text:wght@400;600&display=swap" rel="stylesheet" />
    <style>
      :root {
        --paper: ${theme.palette.paper};
        --ink: ${theme.palette.ink};
        --muted: ${theme.palette.muted};
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        font-family: ${theme.typography.body};
        color: var(--ink);
        background: radial-gradient(circle at top, #fff6e3 0%, #efe5d7 45%, #eadcc8 100%);
      }
      header {
        padding: 32px 24px 12px;
        text-align: center;
      }
      header h1 {
        font-family: ${theme.typography.title};
        font-size: 40px;
        margin: 0 0 6px;
      }
      header p {
        margin: 0;
        color: var(--muted);
      }
      .grid {
        display: grid;
        gap: 24px;
        grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
        padding: 20px 24px 48px;
      }
      .card {
        background: var(--paper);
        border-radius: 18px;
        padding: 12px;
        box-shadow: 0 14px 30px rgba(30, 20, 10, 0.12);
      }
      .card img {
        width: 100%;
        height: auto;
        display: block;
      }
    </style>
  </head>
  <body>
    <header>
      <h1>Boardgame Assets</h1>
      <p>${cards.length} cards rendered • ${theme.width}x${theme.height} px</p>
    </header>
    <section class="grid">
      ${cardFiles
        .map((card) => `<div class="card"><img src="${card.file}" alt="${card.id}" /></div>`)
        .join("\n")}
    </section>
  </body>
</html>`;

fs.writeFileSync(path.join(outputDir, "index.html"), html, "utf8");
console.log(`Rendered ${cards.length} cards to output/`);
