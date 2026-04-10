import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { renderCardSvg, renderTemplateSvg } from "./render/cardSvg.js";
import { defaultTemplate } from "./template.js";
import { normalizeCard, normalizeTemplate } from "./normalize.js";
import type { CardData, CardTemplate, Collection } from "./types.js";

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

const uniqueId = (base: string, existsFn: (id: string) => boolean): string => {
  let id = base;
  let suffix = 1;
  while (existsFn(id)) id = `${base}-${suffix++}`;
  return id;
};

// --- Paths ---

const gamePath = (gameId: string) => path.join(dataRoot, gameId, "game.json");
const templatesDir = (gameId: string) => path.join(dataRoot, gameId, "templates");
const templateFilePath = (gameId: string, templateId: string) => path.join(templatesDir(gameId), `${templateId}.json`);
const collectionsDir = (gameId: string) => path.join(dataRoot, gameId, "collections");
const collectionDir = (gameId: string, collectionId: string) => path.join(collectionsDir(gameId), collectionId);
const collectionPath = (gameId: string, collectionId: string) => path.join(collectionDir(gameId, collectionId), "collection.json");
const collectionCardsDir = (gameId: string, collectionId: string) => path.join(collectionDir(gameId, collectionId), "cards");
const collectionCardPath = (gameId: string, collectionId: string, cardId: string) => path.join(collectionCardsDir(gameId, collectionId), `${cardId}.json`);
const globalFontsDir = path.resolve("fonts");
const globalFontsManifest = path.join(globalFontsDir, "fonts.json");

type FontEntry = { name: string; file: string; source: "upload" | "google" };

const loadFonts = (): Record<string, FontEntry> => readJson<Record<string, FontEntry>>(globalFontsManifest, {});
const gameFontsDir = (gameId: string) => path.join(dataRoot, gameId, "fonts");
const gameFontsManifest = (gameId: string) => path.join(gameFontsDir(gameId), "fonts.json");

const loadGameFonts = (gameId: string): Record<string, FontEntry> =>
  readJson<Record<string, FontEntry>>(gameFontsManifest(gameId), {});
const saveGameFonts = (gameId: string, fonts: Record<string, FontEntry>) => {
  fs.mkdirSync(gameFontsDir(gameId), { recursive: true });
  writeJson(gameFontsManifest(gameId), fonts);
};
const imagesDir = (gameId: string) => path.join(dataRoot, gameId, "images");

const hashBuffer = (data: Buffer): string =>
  crypto.createHash("sha256").update(data).digest("hex").slice(0, 12);

type GameMeta = { id: string; name: string; createdAt: string; updatedAt: string };

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
        const fp = path.join(gameFontsDir(gameId), fontSlot.file);
        if (fs.existsSync(fp)) fontData[slot] = { name: fontSlot.name, data: fs.readFileSync(fp) };
      }
    }
  }
  return fontData;
};

// --- Data access ---

const listGames = (): GameMeta[] => {
  if (!fs.existsSync(dataRoot)) return [];
  return fs.readdirSync(dataRoot, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => readJson<GameMeta | null>(gamePath(d.name), null))
    .filter(Boolean) as GameMeta[];
};

const listTemplates = (gameId: string): CardTemplate[] => {
  const dir = templatesDir(gameId);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => readJson<any>(path.join(dir, f), null))
    .filter(Boolean)
    .map((t) => normalizeTemplate(t));
};

const loadTemplate = (gameId: string, templateId: string): CardTemplate | null => {
  const fp = templateFilePath(gameId, templateId);
  if (!fs.existsSync(fp)) return null;
  const raw = readJson<unknown>(fp, null);
  if (!raw) return null;
  return normalizeTemplate(raw);
};

const listCollections = (gameId: string): Collection[] => {
  const dir = collectionsDir(gameId);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => readJson<Collection | null>(collectionPath(gameId, d.name), null))
    .filter(Boolean) as Collection[];
};

const listCollectionCards = (gameId: string, collectionId: string): CardData[] => {
  const dir = collectionCardsDir(gameId, collectionId);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => readJson<Partial<CardData> | null>(path.join(dir, f), null))
    .filter(Boolean)
    .map((c) => normalizeCard(c));
};

// --- Migration from old structure ---

const migrateGameIfNeeded = (gameId: string) => {
  const oldTemplatePath = path.join(dataRoot, gameId, "template.json");
  const oldCardsDir = path.join(dataRoot, gameId, "cards");
  const newTemplatesDir = templatesDir(gameId);
  const newCollectionsDir = collectionsDir(gameId);

  // Already migrated
  if (fs.existsSync(newTemplatesDir) || fs.existsSync(newCollectionsDir)) return;

  // Migrate template
  let templateId = "default";
  if (fs.existsSync(oldTemplatePath)) {
    const template = readJson<any>(oldTemplatePath, null);
    if (template) {
      templateId = template.id || "default";
      fs.mkdirSync(newTemplatesDir, { recursive: true });
      writeJson(templateFilePath(gameId, templateId), template);
    }
    fs.rmSync(oldTemplatePath);
  } else {
    fs.mkdirSync(newTemplatesDir, { recursive: true });
    writeJson(templateFilePath(gameId, templateId), defaultTemplate());
  }

  // Migrate cards into a default collection
  const collId = "default";
  const collection: Collection = { id: collId, name: "Default", templateId };
  fs.mkdirSync(collectionCardsDir(gameId, collId), { recursive: true });
  writeJson(collectionPath(gameId, collId), collection);

  if (fs.existsSync(oldCardsDir)) {
    const files = fs.readdirSync(oldCardsDir).filter((f) => f.endsWith(".json"));
    for (const file of files) {
      const src = path.join(oldCardsDir, file);
      const dest = path.join(collectionCardsDir(gameId, collId), file);
      fs.renameSync(src, dest);
    }
    fs.rmSync(oldCardsDir, { recursive: true, force: true });
  }

  // Migrate game-level fonts to global
  const oldFontsDir = path.join(dataRoot, gameId, "fonts");
  if (fs.existsSync(oldFontsDir)) {
    const fontFiles = fs.readdirSync(oldFontsDir);
    for (const file of fontFiles) {
      const src = path.join(oldFontsDir, file);
      const dest = path.join(globalFontsDir, file);
      if (!fs.existsSync(dest)) fs.copyFileSync(src, dest);
    }
    fs.rmSync(oldFontsDir, { recursive: true, force: true });
    // Merge font entries from template into global manifest
    const template = readJson<any>(templateFilePath(gameId, templateId), null);
    if (template?.fonts) {
      const fonts = loadFonts();
      for (const [key, slot] of Object.entries(template.fonts as Record<string, FontEntry>)) {
        if (slot.file && !fonts[key]) fonts[key] = slot;
      }
      saveFonts(fonts);
    }
  }
};

const migrateGlobalFontsToGames = () => {
  if (!fs.existsSync(globalFontsDir)) return;
  const globalFonts = loadFonts();
  if (Object.keys(globalFonts).length === 0) return;
  if (!fs.existsSync(dataRoot)) return;
  const games = fs.readdirSync(dataRoot, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);
  for (const gameId of games) {
    const templates = (() => {
      const dir = templatesDir(gameId);
      if (!fs.existsSync(dir)) return [];
      return fs.readdirSync(dir)
        .filter((f) => f.endsWith(".json"))
        .map((f) => readJson<any>(path.join(dir, f), null))
        .filter(Boolean);
    })();
    const referencedFiles = new Set<string>();
    for (const t of templates) {
      if (t?.fonts) {
        for (const slot of Object.values(t.fonts as Record<string, FontEntry>)) {
          if (slot.file) referencedFiles.add(slot.file);
        }
      }
    }
    if (referencedFiles.size === 0) continue;
    const gameDir = gameFontsDir(gameId);
    fs.mkdirSync(gameDir, { recursive: true });
    const gameFonts = loadGameFonts(gameId);
    let changed = false;
    for (const [key, entry] of Object.entries(globalFonts)) {
      if (!referencedFiles.has(entry.file)) continue;
      const src = path.join(globalFontsDir, entry.file);
      const dest = path.join(gameDir, entry.file);
      if (fs.existsSync(src) && !fs.existsSync(dest)) fs.copyFileSync(src, dest);
      if (!gameFonts[key]) {
        gameFonts[key] = entry;
        changed = true;
      }
    }
    if (changed) saveGameFonts(gameId, gameFonts);
  }
};

migrateGlobalFontsToGames();

// --- App ---

const app = new Hono();

// Games
app.get("/api/games", (c) => c.json(listGames()));

app.post("/api/games", async (c) => {
  const body = await c.req.json<{ name?: string }>();
  const name = body?.name?.trim();
  if (!name) return c.json({ error: "Name required" }, 400);
  const id = uniqueId(slugify(name) || `game-${Date.now()}`, (id) => fs.existsSync(path.join(dataRoot, id)));
  const now = new Date().toISOString();
  const game: GameMeta = { id, name, createdAt: now, updatedAt: now };
  writeJson(gamePath(id), game);

  // Create default template
  const template = defaultTemplate();
  fs.mkdirSync(templatesDir(id), { recursive: true });
  writeJson(templateFilePath(id, template.id), template);

  // Create default collection
  const collection: Collection = { id: "default", name: "Default", templateId: template.id };
  fs.mkdirSync(collectionCardsDir(id, "default"), { recursive: true });
  writeJson(collectionPath(id, "default"), collection);

  // Download default fonts per-game in background (if not already present)
  (async () => {
    try {
      const defaults = [{ slot: "title", fontName: "Fraunces" }, { slot: "body", fontName: "Space Grotesk" }];
      const fonts = loadGameFonts(id);
      const t = readJson<any>(templateFilePath(id, template.id), null);
      if (!t?.fonts) return;
      for (const { slot, fontName } of defaults) {
        if (fonts[slot]?.file) {
          // Already have this font for this game, just update template reference
          if (t.fonts[slot]) t.fonts[slot].file = fonts[slot].file;
          continue;
        }
        try {
          const { data } = await fetchGoogleFont(fontName);
          const hash = hashBuffer(data);
          const fileName = `${hash}.woff2`;
          fs.mkdirSync(gameFontsDir(id), { recursive: true });
          fs.writeFileSync(path.join(gameFontsDir(id), fileName), data);
          fonts[slot] = { name: fontName, file: fileName, source: "google" };
          if (t.fonts[slot]) t.fonts[slot].file = fileName;
        } catch { /* non-critical */ }
      }
      saveGameFonts(id, fonts);
      writeJson(templateFilePath(id, template.id), t);
    } catch { /* non-critical */ }
  })();
  return c.json(game, 201);
});

// Single game
app.get("/api/games/:gameId", (c) => {
  const gameId = c.req.param("gameId");
  migrateGameIfNeeded(gameId);
  const game = readJson<GameMeta | null>(gamePath(gameId), null);
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

// Templates
app.get("/api/games/:gameId/templates", (c) => {
  const gameId = c.req.param("gameId");
  migrateGameIfNeeded(gameId);
  return c.json(listTemplates(gameId));
});

app.post("/api/games/:gameId/templates", async (c) => {
  const gameId = c.req.param("gameId");
  const body = await c.req.json<{ name?: string }>();
  const name = body?.name?.trim() || "New Template";
  const template = defaultTemplate();
  template.id = uniqueId(slugify(name) || "template", (id) => fs.existsSync(templateFilePath(gameId, id)));
  template.name = name;
  writeJson(templateFilePath(gameId, template.id), template);
  touchGame(gameId);
  return c.json(template, 201);
});

app.get("/api/games/:gameId/templates/:templateId", (c) => {
  const template = loadTemplate(c.req.param("gameId"), c.req.param("templateId"));
  if (!template) return c.json({ error: "Not found" }, 404);
  return c.json(template);
});

app.put("/api/games/:gameId/templates/:templateId", async (c) => {
  const gameId = c.req.param("gameId");
  const templateId = c.req.param("templateId");
  const body = await c.req.json<CardTemplate>();
  if (!body) return c.json({ error: "Template required" }, 400);
  writeJson(templateFilePath(gameId, templateId), body);
  touchGame(gameId);
  return c.json(body);
});

app.delete("/api/games/:gameId/templates/:templateId", (c) => {
  const gameId = c.req.param("gameId");
  const templateId = c.req.param("templateId");
  // Don't allow deleting if any collection references it
  const collections = listCollections(gameId);
  const inUse = collections.some((col) => col.templateId === templateId);
  if (inUse) return c.json({ error: "Template is in use by a collection" }, 400);
  fs.rmSync(templateFilePath(gameId, templateId), { force: true });
  touchGame(gameId);
  return c.body(null, 204);
});

app.post("/api/games/:gameId/templates/:templateId/copy", (c) => {
  const gameId = c.req.param("gameId");
  const templateId = c.req.param("templateId");
  const template = loadTemplate(gameId, templateId);
  if (!template) return c.json({ error: "Not found" }, 404);
  const existing = listTemplates(gameId);
  const newName = `Template ${existing.length + 1}`;
  const newId = uniqueId(slugify(newName) || "template", (id) => fs.existsSync(templateFilePath(gameId, id)));
  const copy = { ...template, id: newId, name: newName };
  writeJson(templateFilePath(gameId, newId), copy);
  touchGame(gameId);
  return c.json(copy, 201);
});

// Collections
app.get("/api/games/:gameId/collections", (c) => {
  const gameId = c.req.param("gameId");
  migrateGameIfNeeded(gameId);
  return c.json(listCollections(gameId));
});

app.post("/api/games/:gameId/collections", async (c) => {
  const gameId = c.req.param("gameId");
  const body = await c.req.json<{ name?: string; templateId?: string }>();
  const name = body?.name?.trim() || "New Collection";
  const templateId = body?.templateId;
  if (!templateId) return c.json({ error: "templateId required" }, 400);
  // Verify template exists
  if (!loadTemplate(gameId, templateId)) return c.json({ error: "Template not found" }, 404);
  const id = uniqueId(slugify(name) || "collection", (id) => fs.existsSync(collectionDir(gameId, id)));
  const collection: Collection = { id, name, templateId };
  fs.mkdirSync(collectionCardsDir(gameId, id), { recursive: true });
  writeJson(collectionPath(gameId, id), collection);
  touchGame(gameId);
  return c.json(collection, 201);
});

app.get("/api/games/:gameId/collections/:collectionId", (c) => {
  const col = readJson<Collection | null>(collectionPath(c.req.param("gameId"), c.req.param("collectionId")), null);
  if (!col) return c.json({ error: "Not found" }, 404);
  return c.json(col);
});

app.put("/api/games/:gameId/collections/:collectionId", async (c) => {
  const gameId = c.req.param("gameId");
  const collectionId = c.req.param("collectionId");
  const body = await c.req.json<Partial<Collection>>();
  const col = readJson<Collection | null>(collectionPath(gameId, collectionId), null);
  if (!col) return c.json({ error: "Not found" }, 404);
  if (body.templateId && !loadTemplate(gameId, body.templateId)) return c.json({ error: "Template not found" }, 404);
  const updated = { ...col, ...body, id: collectionId };
  writeJson(collectionPath(gameId, collectionId), updated);
  touchGame(gameId);
  return c.json(updated);
});

app.delete("/api/games/:gameId/collections/:collectionId", (c) => {
  const gameId = c.req.param("gameId");
  fs.rmSync(collectionDir(gameId, c.req.param("collectionId")), { recursive: true, force: true });
  touchGame(gameId);
  return c.body(null, 204);
});

// Cards (within collections)
app.get("/api/games/:gameId/collections/:collectionId/cards", (c) => {
  return c.json(listCollectionCards(c.req.param("gameId"), c.req.param("collectionId")));
});

app.post("/api/games/:gameId/collections/:collectionId/cards", async (c) => {
  const gameId = c.req.param("gameId");
  const collectionId = c.req.param("collectionId");
  const body = await c.req.json<Partial<CardData>>();
  const name = body?.name?.trim();
  if (!name) return c.json({ error: "Name required" }, 400);
  const id = uniqueId(slugify(name) || `card-${Date.now()}`, (id) => fs.existsSync(collectionCardPath(gameId, collectionId, id)));
  const card = normalizeCard({ ...body, id });
  writeJson(collectionCardPath(gameId, collectionId, id), card);
  touchGame(gameId);
  return c.json(card, 201);
});

app.get("/api/games/:gameId/collections/:collectionId/cards/:cardId", (c) => {
  const gameId = c.req.param("gameId");
  const collectionId = c.req.param("collectionId");
  let cardId = c.req.param("cardId");
  const isSvg = cardId.endsWith(".svg");
  if (isSvg) cardId = cardId.slice(0, -4);
  const raw = readJson<Partial<CardData> | null>(collectionCardPath(gameId, collectionId, cardId), null);
  if (!raw) return c.json({ error: "Not found" }, 404);
  const card = normalizeCard(raw);
  if (isSvg) {
    const col = readJson<Collection | null>(collectionPath(gameId, collectionId), null);
    const template = col ? loadTemplate(gameId, col.templateId) : null;
    if (!template) return c.json({ error: "Template not found" }, 404);
    const fontData = loadFontData(gameId, template);
    let svg = renderCardSvg(card, template, { fonts: fontData });
    svg = embedLocalImages(svg, gameId);
    return c.body(svg, { headers: { "Content-Type": "image/svg+xml" } });
  }
  return c.json(card);
});

app.put("/api/games/:gameId/collections/:collectionId/cards/:cardId", async (c) => {
  const gameId = c.req.param("gameId");
  const collectionId = c.req.param("collectionId");
  const cardId = c.req.param("cardId");
  const body = await c.req.json<Partial<CardData>>();
  const raw = readJson<Partial<CardData> | null>(collectionCardPath(gameId, collectionId, cardId), null);
  const updated = normalizeCard({ ...raw, ...body, id: cardId });
  writeJson(collectionCardPath(gameId, collectionId, cardId), updated);
  touchGame(gameId);
  return c.json(updated, raw ? 200 : 201);
});

app.delete("/api/games/:gameId/collections/:collectionId/cards/:cardId", (c) => {
  const gameId = c.req.param("gameId");
  fs.rmSync(collectionCardPath(gameId, c.req.param("collectionId"), c.req.param("cardId")), { force: true });
  touchGame(gameId);
  return c.body(null, 204);
});

app.post("/api/games/:gameId/collections/:collectionId/cards/:cardId/copy", (c) => {
  const gameId = c.req.param("gameId");
  const collectionId = c.req.param("collectionId");
  const cardId = c.req.param("cardId");
  const raw = readJson<Partial<CardData> | null>(collectionCardPath(gameId, collectionId, cardId), null);
  if (!raw) return c.json({ error: "Not found" }, 404);
  const card = normalizeCard(raw);
  const existing = listCollectionCards(gameId, collectionId);
  const newName = `New Card ${existing.length + 1}`;
  const newId = uniqueId(slugify(newName) || `card-${Date.now()}`, (id) => fs.existsSync(collectionCardPath(gameId, collectionId, id)));
  const copy = { ...card, id: newId, name: newName };
  writeJson(collectionCardPath(gameId, collectionId, newId), copy);
  touchGame(gameId);
  return c.json(copy, 201);
});

// Render (with template)
app.post("/api/games/:gameId/render", async (c) => {
  const gameId = c.req.param("gameId");
  const body = await c.req.json<any>();
  const candidate = (body && "card" in body ? body.card : body) ?? {};
  const card = normalizeCard(candidate);
  const template = body?.template ?? (body?.templateId ? loadTemplate(gameId, body.templateId) : null);
  if (!template) return c.json({ error: "Template required (pass template or templateId)" }, 400);
  const fontData = loadFontData(gameId, template);
  let svg = renderCardSvg(card, template, { fonts: fontData });
  svg = embedLocalImages(svg, gameId);
  return c.body(svg, { headers: { "Content-Type": "image/svg+xml" } });
});

// Fonts (per-game)
app.get("/api/games/:gameId/fonts", (c) => c.json(loadGameFonts(c.req.param("gameId"))));

app.post("/api/games/:gameId/fonts/google", async (c) => {
  const gameId = c.req.param("gameId");
  const body = await c.req.json<{ name?: string; slotName?: string }>();
  const fontName = body?.name?.trim();
  const slotName = body?.slotName?.trim();
  if (!fontName) return c.json({ error: "Font name required" }, 400);
  try {
    const { data, name } = await fetchGoogleFont(fontName);
    const hash = hashBuffer(data);
    const file = `${hash}.woff2`;
    fs.mkdirSync(gameFontsDir(gameId), { recursive: true });
    fs.writeFileSync(path.join(gameFontsDir(gameId), file), data);
    const fonts = loadGameFonts(gameId);
    const slot = slotName || name.toLowerCase().replace(/\s+/g, '-');
    fonts[slot] = { name, file, source: "google" };
    saveGameFonts(gameId, fonts);
    touchGame(gameId);
    return c.json({ fonts });
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : "Failed to fetch font" }, 400);
  }
});

app.post("/api/games/:gameId/fonts/upload", async (c) => {
  const gameId = c.req.param("gameId");
  const disposition = c.req.header("content-disposition") ?? "";
  const filenameMatch = disposition.match(/filename="([^"]+)"/) || disposition.match(/filename=(\S+)/);
  const originalName = filenameMatch ? filenameMatch[1] : "font.woff2";
  const slotName = c.req.header("x-slot-name");
  const ext = path.extname(originalName).toLowerCase();
  if (![".woff2", ".woff", ".ttf", ".otf"].includes(ext)) {
    return c.json({ error: `Unsupported font format: ${ext}` }, 400);
  }
  const data = Buffer.from(await c.req.arrayBuffer());
  const hash = hashBuffer(data);
  const file = `${hash}${ext}`;
  fs.mkdirSync(gameFontsDir(gameId), { recursive: true });
  fs.writeFileSync(path.join(gameFontsDir(gameId), file), data);
  const fonts = loadGameFonts(gameId);
  const slot = slotName?.trim() || path.basename(originalName, ext).replace(/[-_]+/g, ' ');
  fonts[slot] = { name: path.basename(originalName, ext), file, source: "upload" };
  saveGameFonts(gameId, fonts);
  touchGame(gameId);
  return c.json({ fonts });
});

app.get("/api/games/:gameId/fonts/:file", (c) => {
  const fp = path.join(gameFontsDir(c.req.param("gameId")), c.req.param("file"));
  if (!fs.existsSync(fp)) return c.json({ error: "Not found" }, 404);
  const ext = path.extname(c.req.param("file"));
  const mimeTypes: Record<string, string> = { ".woff2": "font/woff2", ".woff": "font/woff", ".ttf": "font/ttf", ".otf": "font/otf" };
  return c.body(fs.readFileSync(fp), { headers: { "Content-Type": mimeTypes[ext] ?? "application/octet-stream" } });
});

app.delete("/api/games/:gameId/fonts/:file", (c) => {
  const gameId = c.req.param("gameId");
  const fontFile = c.req.param("file");
  fs.rmSync(path.join(gameFontsDir(gameId), fontFile), { force: true });
  const fonts = loadGameFonts(gameId);
  for (const [key, entry] of Object.entries(fonts)) {
    if (entry.file === fontFile) delete fonts[key];
  }
  saveGameFonts(gameId, fonts);
  touchGame(gameId);
  return c.json({ fonts });
});

// Images
app.post("/api/games/:gameId/images/upload", async (c) => {
  const gameId = c.req.param("gameId");
  const disposition = c.req.header("content-disposition") ?? "";
  const nameMatch = disposition.match(/filename="([^"]+)"/) || disposition.match(/filename=(\S+)/);
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
  migrateGameIfNeeded(gameId);
  const collections = listCollections(gameId);
  const allCards: { card: CardData; collectionId: string }[] = [];
  for (const col of collections) {
    for (const card of listCollectionCards(gameId, col.id)) {
      allCards.push({ card, collectionId: col.id });
    }
  }
  const items = allCards.map(({ card, collectionId }) =>
    `<div class="sheet-card"><img src="/api/games/${gameId}/collections/${collectionId}/cards/${card.id}.svg" alt="${card.name}" /></div>`
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
