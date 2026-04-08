import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { renderCardSvg, renderTemplateSvg } from "./render/cardSvg.js";
import { defaultTemplate } from "./template.js";
import { normalizeCard, normalizeTemplate } from "./normalize.js";
import type { CardData, CardTemplate } from "./types.js";

const port = Number(process.argv[2] ?? 5173);
const dataRoot = path.resolve("games");

fs.mkdirSync(dataRoot, { recursive: true });

// --- Helpers ---

const readJson = <T>(filePath: string, fallback: T): T => {
  if (!fs.existsSync(filePath)) return fallback;
  return JSON.parse(fs.readFileSync(filePath, "utf8")) as T;
};

const writeJson = (filePath: string, value: unknown) => {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2), "utf8");
};

const slugify = (value: string) =>
  value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

const gamePath = (gameId: string) => path.join(dataRoot, gameId, "game.json");
const templatePath = (gameId: string) => path.join(dataRoot, gameId, "template.json");
const cardsDir = (gameId: string) => path.join(dataRoot, gameId, "cards");
const cardPath = (gameId: string, cardId: string) => path.join(cardsDir(gameId), `${cardId}.json`);
const fontsDir = (gameId: string) => path.join(dataRoot, gameId, "fonts");
const imagesDir = (gameId: string) => path.join(dataRoot, gameId, "images");

const hashBuffer = (data: Buffer): string =>
  crypto.createHash("sha256").update(data).digest("hex").slice(0, 12);

const touchGame = (gameId: string) => {
  const game = readJson<GameMeta | null>(gamePath(gameId), null);
  if (!game) return;
  writeJson(gamePath(gameId), { ...game, updatedAt: new Date().toISOString() });
};

const fetchGoogleFont = async (fontName: string): Promise<{ data: Buffer; name: string }> => {
  const cssUrl = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(fontName)}`;
  const cssRes = await fetch(cssUrl, {
    headers: { "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36" },
  });
  if (!cssRes.ok) throw new Error(`Font "${fontName}" not found on Google Fonts. Use the exact name from fonts.google.com, or paste the URL directly.`);
  const css = await cssRes.text();
  const urlMatch = css.match(/src:\s*url\(([^)]+)\)\s*format\(['"]woff2['"]\)/);
  if (!urlMatch) throw new Error(`No woff2 URL found for: ${fontName}`);
  const fontRes = await fetch(urlMatch[1]);
  if (!fontRes.ok) throw new Error("Failed to download font file");
  return { data: Buffer.from(await fontRes.arrayBuffer()), name: fontName };
};

const embedLocalImages = (svg: string, gameId: string): string => {
  return svg.replace(/href="(\/api\/games\/[^/]+\/images\/([^"]+))"/g, (_match, _url, fileName) => {
    const filePath = path.join(imagesDir(gameId), fileName);
    if (!fs.existsSync(filePath)) return _match;
    const data = fs.readFileSync(filePath);
    const ext = path.extname(fileName).toLowerCase();
    const mimeTypes: Record<string, string> = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".gif": "image/gif", ".svg": "image/svg+xml" };
    return `href="data:${mimeTypes[ext] ?? "application/octet-stream"};base64,${data.toString("base64")}"`;
  });
};

const loadFontData = (gameId: string, template: CardTemplate): Record<string, { name: string; data: Buffer }> => {
  const fontData: Record<string, { name: string; data: Buffer }> = {};
  if (template.fonts) {
    for (const [slot, fontSlot] of Object.entries(template.fonts as Record<string, { name: string; file: string }>)) {
      if (fontSlot.file) {
        const fp = path.join(fontsDir(gameId), fontSlot.file);
        if (fs.existsSync(fp)) fontData[slot] = { name: fontSlot.name, data: fs.readFileSync(fp) };
      }
    }
  }
  return fontData;
};

type GameMeta = { id: string; name: string; createdAt: string; updatedAt: string };

const listGames = (): GameMeta[] => {
  if (!fs.existsSync(dataRoot)) return [];
  return fs.readdirSync(dataRoot, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => readJson<GameMeta | null>(gamePath(d.name), null))
    .filter(Boolean) as GameMeta[];
};

const listCards = (gameId: string): CardData[] => {
  const dir = cardsDir(gameId);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => readJson<Partial<CardData> | null>(path.join(dir, f), null))
    .filter(Boolean)
    .map((c) => normalizeCard(c));
};

const loadTemplate = (gameId: string): CardTemplate => {
  const fallback = defaultTemplate();
  if (!fs.existsSync(templatePath(gameId))) {
    writeJson(templatePath(gameId), fallback);
    return fallback;
  }
  const raw = readJson<unknown>(templatePath(gameId), null);
  if (!raw || (typeof raw === "object" && (raw as any).version !== 2)) {
    writeJson(templatePath(gameId), fallback);
    return fallback;
  }
  return normalizeTemplate(raw);
};

const injectDebugLabel = (svg: string, debugAttach: Record<string, unknown>) => {
  const label = `ATTACH ${JSON.stringify(debugAttach)}`.replaceAll("<", "&lt;").replaceAll(">", "&gt;");
  return svg.replace("</svg>", `<text x="24" y="70" font-size="12" fill="#d64545" font-family="Space Grotesk, sans-serif">${label}</text></svg>`);
};

// --- App ---

const app = new Hono();

// Games
app.get("/api/games", (c) => c.json(listGames()));

app.post("/api/games", async (c) => {
  const body = await c.req.json<{ name?: string }>();
  const name = body?.name?.trim();
  if (!name) return c.json({ error: "Name required" }, 400);
  const idBase = slugify(name) || `game-${Date.now()}`;
  let id = idBase;
  let suffix = 1;
  while (fs.existsSync(path.join(dataRoot, id))) id = `${idBase}-${suffix++}`;
  const now = new Date().toISOString();
  const game: GameMeta = { id, name, createdAt: now, updatedAt: now };
  writeJson(gamePath(id), game);
  writeJson(templatePath(id), defaultTemplate());
  // Download default fonts in background
  (async () => {
    try {
      const dir = fontsDir(id);
      fs.mkdirSync(dir, { recursive: true });
      const defaults = [{ slot: "title", fontName: "Fraunces" }, { slot: "body", fontName: "Space Grotesk" }];
      const template = readJson<any>(templatePath(id), null);
      if (!template?.fonts) return;
      for (const { slot, fontName } of defaults) {
        try {
          const { data } = await fetchGoogleFont(fontName);
          const hash = hashBuffer(data);
          const fileName = `${hash}.woff2`;
          fs.writeFileSync(path.join(dir, fileName), data);
          if (template.fonts[slot]) template.fonts[slot].file = fileName;
        } catch { /* non-critical */ }
      }
      writeJson(templatePath(id), template);
    } catch { /* non-critical */ }
  })();
  return c.json(game, 201);
});

// Single game
app.get("/api/games/:gameId", (c) => {
  const game = readJson<GameMeta | null>(gamePath(c.req.param("gameId")), null);
  if (!game) return c.json({ error: "Not found" }, 404);
  return c.json(game);
});

app.put("/api/games/:gameId", async (c) => {
  const gameId = c.req.param("gameId");
  const body = await c.req.json<{ name?: string }>();
  const name = body?.name?.trim();
  if (!name) return c.json({ error: "Name required" }, 400);
  const game = readJson<GameMeta | null>(gamePath(gameId), null);
  if (!game) return c.json({ error: "Not found" }, 404);
  const updated = { ...game, name, updatedAt: new Date().toISOString() };
  writeJson(gamePath(gameId), updated);
  return c.json(updated);
});

app.delete("/api/games/:gameId", (c) => {
  fs.rmSync(path.join(dataRoot, c.req.param("gameId")), { recursive: true, force: true });
  return c.body(null, 204);
});

// Template
app.get("/api/games/:gameId/template", (c) => c.json(loadTemplate(c.req.param("gameId"))));

app.put("/api/games/:gameId/template", async (c) => {
  const gameId = c.req.param("gameId");
  const body = await c.req.json<CardTemplate>();
  if (!body) return c.json({ error: "Template required" }, 400);
  writeJson(templatePath(gameId), body);
  touchGame(gameId);
  return c.json(body);
});

app.get("/api/games/:gameId/template.svg", (c) => {
  const template = loadTemplate(c.req.param("gameId"));
  return c.body(renderTemplateSvg(template), { headers: { "Content-Type": "image/svg+xml" } });
});

app.post("/api/games/:gameId/template/preview", async (c) => {
  const body = await c.req.json<CardTemplate>();
  if (!body) return c.json({ error: "Template required" }, 400);
  return c.body(renderTemplateSvg(body), { headers: { "Content-Type": "image/svg+xml" } });
});

// Render
app.post("/api/games/:gameId/render", async (c) => {
  const gameId = c.req.param("gameId");
  const body = await c.req.json<any>();
  const candidate = (body && "card" in body ? body.card : body) ?? {};
  const card = normalizeCard(candidate);
  const template = body?.template ?? loadTemplate(gameId);
  const debug = Boolean(body?.debug);
  const fontData = loadFontData(gameId, template);
  let svg = renderCardSvg(card, template, { debug, fonts: fontData });
  svg = embedLocalImages(svg, gameId);
  if (body?.debugAttach) svg = injectDebugLabel(svg, body.debugAttach);
  return c.body(svg, { headers: { "Content-Type": "image/svg+xml" } });
});

app.post("/api/render", async (c) => {
  const body = await c.req.json<any>();
  const candidate = (body && "card" in body ? body.card : body) ?? {};
  const card = normalizeCard(candidate);
  return c.body(renderCardSvg(card, defaultTemplate()), { headers: { "Content-Type": "image/svg+xml" } });
});

// Cards
app.get("/api/games/:gameId/cards", (c) => c.json(listCards(c.req.param("gameId"))));

app.post("/api/games/:gameId/cards", async (c) => {
  const gameId = c.req.param("gameId");
  const body = await c.req.json<Partial<CardData>>();
  const name = body?.name?.trim();
  if (!name) return c.json({ error: "Name required" }, 400);
  const idBase = slugify(name) || `card-${Date.now()}`;
  let id = idBase;
  let suffix = 1;
  while (fs.existsSync(cardPath(gameId, id))) id = `${idBase}-${suffix++}`;
  const card = normalizeCard({ ...body, id });
  writeJson(cardPath(gameId, id), card);
  touchGame(gameId);
  return c.json(card, 201);
});

app.get("/api/games/:gameId/cards/:cardId", (c) => {
  const gameId = c.req.param("gameId");
  let cardId = c.req.param("cardId");
  const isSvg = cardId.endsWith(".svg");
  if (isSvg) cardId = cardId.slice(0, -4);
  const raw = readJson<Partial<CardData> | null>(cardPath(gameId, cardId), null);
  if (!raw) return c.json({ error: "Not found" }, 404);
  const card = normalizeCard(raw);
  if (isSvg) {
    const template = loadTemplate(gameId);
    const fontData = loadFontData(gameId, template);
    let svg = renderCardSvg(card, template, { fonts: fontData });
    svg = embedLocalImages(svg, gameId);
    return c.body(svg, { headers: { "Content-Type": "image/svg+xml" } });
  }
  return c.json(card);
});

app.put("/api/games/:gameId/cards/:cardId", async (c) => {
  const gameId = c.req.param("gameId");
  const cardId = c.req.param("cardId");
  const body = await c.req.json<Partial<CardData>>();
  const raw = readJson<Partial<CardData> | null>(cardPath(gameId, cardId), null);
  const updated = normalizeCard({ ...raw, ...body, id: cardId });
  writeJson(cardPath(gameId, cardId), updated);
  touchGame(gameId);
  return c.json(updated, raw ? 200 : 201);
});

app.delete("/api/games/:gameId/cards/:cardId", (c) => {
  fs.rmSync(cardPath(c.req.param("gameId"), c.req.param("cardId")), { force: true });
  touchGame(c.req.param("gameId"));
  return c.body(null, 204);
});

// Fonts
app.post("/api/games/:gameId/fonts/google", async (c) => {
  const gameId = c.req.param("gameId");
  const body = await c.req.json<{ name?: string; slotName?: string }>();
  const fontName = body?.name?.trim();
  const slotName = body?.slotName?.trim();
  if (!fontName) return c.json({ error: "Font name required" }, 400);
  if (!slotName) return c.json({ error: "Slot name required" }, 400);
  try {
    const { data, name } = await fetchGoogleFont(fontName);
    const hash = hashBuffer(data);
    const file = `${hash}.woff2`;
    const dir = fontsDir(gameId);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, file), data);
    const template = loadTemplate(gameId);
    if (!template.fonts) template.fonts = {};
    template.fonts[slotName] = { name, file, source: "google" };
    fs.writeFileSync(templatePath(gameId), JSON.stringify(template, null, 2));
    return c.json({ fonts: template.fonts });
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : "Failed to fetch font" }, 400);
  }
});

app.post("/api/games/:gameId/fonts/upload", async (c) => {
  const gameId = c.req.param("gameId");
  const disposition = c.req.header("content-disposition") ?? "";
  const filenameMatch = disposition.match(/filename="?([^";\s]+)"?/);
  const originalName = filenameMatch ? filenameMatch[1] : "font.woff2";
  const slotName = c.req.header("x-slot-name");
  if (!slotName?.trim()) return c.json({ error: "Slot name required" }, 400);
  const ext = path.extname(originalName).toLowerCase();
  if (![".woff2", ".woff", ".ttf", ".otf"].includes(ext)) {
    return c.json({ error: `Unsupported font format: ${ext}` }, 400);
  }
  const data = Buffer.from(await c.req.arrayBuffer());
  const hash = hashBuffer(data);
  const file = `${hash}${ext}`;
  const dir = fontsDir(gameId);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, file), data);
  const template = loadTemplate(gameId);
  if (!template.fonts) template.fonts = {};
  template.fonts[slotName.trim()] = { name: path.basename(originalName, ext), file, source: "upload" };
  fs.writeFileSync(templatePath(gameId), JSON.stringify(template, null, 2));
  return c.json({ fonts: template.fonts });
});

app.get("/api/games/:gameId/fonts/:file", (c) => {
  const fp = path.join(fontsDir(c.req.param("gameId")), c.req.param("file"));
  if (!fs.existsSync(fp)) return c.json({ error: "Not found" }, 404);
  const ext = path.extname(c.req.param("file"));
  const mimeTypes: Record<string, string> = { ".woff2": "font/woff2", ".woff": "font/woff", ".ttf": "font/ttf", ".otf": "font/otf" };
  return c.body(fs.readFileSync(fp), { headers: { "Content-Type": mimeTypes[ext] ?? "application/octet-stream" } });
});

app.delete("/api/games/:gameId/fonts/:file", (c) => {
  const gameId = c.req.param("gameId");
  const fontFile = c.req.param("file");
  fs.rmSync(path.join(fontsDir(gameId), fontFile), { force: true });
  const template = loadTemplate(gameId);
  if (template.fonts) {
    for (const [key, slot] of Object.entries(template.fonts as Record<string, any>)) {
      if (slot.file === fontFile) delete template.fonts[key];
    }
    fs.writeFileSync(templatePath(gameId), JSON.stringify(template, null, 2));
  }
  return c.json({ fonts: template.fonts ?? {} });
});

// Images
app.post("/api/games/:gameId/images/upload", async (c) => {
  const gameId = c.req.param("gameId");
  const disposition = c.req.header("content-disposition") ?? "";
  const nameMatch = disposition.match(/filename="?([^";\s]+)"?/);
  const originalName = nameMatch ? nameMatch[1] : `image-${Date.now()}.png`;
  const ext = (path.extname(originalName) || ".png").toLowerCase();
  if (![".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg"].includes(ext)) {
    return c.json({ error: "Unsupported image format" }, 400);
  }
  const data = Buffer.from(await c.req.arrayBuffer());
  const hash = hashBuffer(data);
  const fileName = `${hash}${ext}`;
  const dir = imagesDir(gameId);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, fileName), data);
  return c.json({ file: fileName, url: `/api/games/${gameId}/images/${fileName}` }, 201);
});

app.get("/api/games/:gameId/images/:file", (c) => {
  const fp = path.join(imagesDir(c.req.param("gameId")), c.req.param("file"));
  if (!fs.existsSync(fp)) return c.json({ error: "Not found" }, 404);
  const ext = path.extname(c.req.param("file"));
  const mimeTypes: Record<string, string> = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".gif": "image/gif", ".svg": "image/svg+xml" };
  return c.body(fs.readFileSync(fp), { headers: { "Content-Type": mimeTypes[ext] ?? "application/octet-stream" } });
});

app.delete("/api/games/:gameId/images/:file", (c) => {
  fs.rmSync(path.join(imagesDir(c.req.param("gameId")), c.req.param("file")), { force: true });
  return c.body(null, 204);
});

// Print
app.get("/print/:gameId", (c) => {
  const gameId = c.req.param("gameId");
  const cards = listCards(gameId);
  const items = cards.map((card) =>
    `<div class="sheet-card"><img src="/api/games/${gameId}/cards/${card.id}.svg" alt="${card.name}" /></div>`
  ).join("\n");
  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Print Sheet - ${gameId}</title>
  <style>
    @page { margin: 10mm; }
    body { margin: 0; font-family: "Space Grotesk", sans-serif; background: #f4efe6; color: #1b1a17; }
    header { padding: 16px 18px 6px; }
    h1 { margin: 0; font-size: 20px; }
    .sheet { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; padding: 12px; }
    .sheet-card { background: #fffaf2; border: 1px solid #d7cdbd; border-radius: 12px; padding: 6px; break-inside: avoid; }
    .sheet-card img { width: 100%; display: block; }
    @media print { header { display: none; } body { background: white; } }
  </style>
</head>
<body>
  <header><h1>Print Sheet — ${gameId}</h1><p>Use your browser print dialog.</p></header>
  <section class="sheet">${items}</section>
</body>
</html>`;
  return c.html(html);
});

// --- Start ---

serve({ fetch: app.fetch, port, hostname: "0.0.0.0" }, () => {
  console.log(`Editor running at http://localhost:${port}/`);
});
