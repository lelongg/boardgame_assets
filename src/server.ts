import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import express from "express";
import { renderCardSvg, renderLayoutSvg } from "./render/cardSvg.js";
import { defaultLayout } from "./layout.js";
import { normalizeCard, normalizeLayout } from "./normalize.js";
import type { CardData, CardLayout, Collection } from "./types.js";

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
const layoutsDir = (gameId: string) => path.join(dataRoot, gameId, "layouts");
const layoutFilePath = (gameId: string, layoutId: string) => path.join(layoutsDir(gameId), `${layoutId}.json`);
const collectionsDir = (gameId: string) => path.join(dataRoot, gameId, "collections");
const collectionDir = (gameId: string, collectionId: string) => path.join(collectionsDir(gameId), collectionId);
const collectionPath = (gameId: string, collectionId: string) => path.join(collectionDir(gameId, collectionId), "collection.json");
const collectionCardsDir = (gameId: string, collectionId: string) => path.join(collectionDir(gameId, collectionId), "cards");
const collectionCardPath = (gameId: string, collectionId: string, cardId: string) => path.join(collectionCardsDir(gameId, collectionId), `${cardId}.json`);
const globalFontsDir = path.resolve("fonts");
const globalFontsManifest = path.join(globalFontsDir, "fonts.json");

type FontEntry = { name: string; file: string; source: "upload" | "google" };

const loadFonts = (): Record<string, FontEntry> => readJson<Record<string, FontEntry>>(globalFontsManifest, {});
const saveFonts = (fonts: Record<string, FontEntry>) => { fs.mkdirSync(globalFontsDir, { recursive: true }); writeJson(globalFontsManifest, fonts); };
const gameFontsDir = (gameId: string) => path.join(dataRoot, gameId, "fonts");
const gameFontsManifest = (gameId: string) => path.join(gameFontsDir(gameId), "fonts.json");

const loadGameFonts = (gameId: string): Record<string, FontEntry> =>
  readJson<Record<string, FontEntry>>(gameFontsManifest(gameId), {});
const saveGameFonts = (gameId: string, fonts: Record<string, FontEntry>) => {
  fs.mkdirSync(gameFontsDir(gameId), { recursive: true });
  writeJson(gameFontsManifest(gameId), fonts);
};
const imagesDir = (gameId: string) => path.join(dataRoot, gameId, "images");
const ttsDir = (gameId: string) => path.join(dataRoot, gameId, "tts");

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

const loadFontData = (gameId: string): Record<string, { name: string; data: Buffer }> => {
  const fontData: Record<string, { name: string; data: Buffer }> = {};
  const fonts = loadGameFonts(gameId);
  for (const [slot, fontSlot] of Object.entries(fonts)) {
    if (fontSlot.file) {
      const fp = path.join(gameFontsDir(gameId), fontSlot.file);
      if (fs.existsSync(fp)) fontData[slot] = { name: fontSlot.name, data: fs.readFileSync(fp) };
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

const listLayouts = (gameId: string): CardLayout[] => {
  const dir = layoutsDir(gameId);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => readJson<any>(path.join(dir, f), null))
    .filter(Boolean)
    .map((t) => normalizeLayout(t));
};

const loadLayout = (gameId: string, layoutId: string): CardLayout | null => {
  const fp = layoutFilePath(gameId, layoutId);
  if (!fs.existsSync(fp)) return null;
  const raw = readJson<unknown>(fp, null);
  if (!raw) return null;
  return normalizeLayout(raw);
};

const listCollections = (gameId: string): Collection[] => {
  const dir = collectionsDir(gameId);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => readJson<Collection | null>(collectionPath(gameId, d.name), null))
    .filter(Boolean) as Collection[];
};

const naturalCompare = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' }).compare;

const listCollectionCards = (gameId: string, collectionId: string): CardData[] => {
  const dir = collectionCardsDir(gameId, collectionId);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => readJson<Partial<CardData> | null>(path.join(dir, f), null))
    .filter(Boolean)
    .map((c) => normalizeCard(c))
    .sort((a, b) => naturalCompare(a.name, b.name));
};

// --- Migration from old structure ---

const migrateGameIfNeeded = (gameId: string) => {
  const oldTemplatesDir = path.join(dataRoot, gameId, "templates");
  if (fs.existsSync(oldTemplatesDir) && !fs.existsSync(layoutsDir(gameId))) {
    fs.renameSync(oldTemplatesDir, layoutsDir(gameId));
  }
  const colDir = collectionsDir(gameId);
  if (fs.existsSync(colDir)) {
    for (const colId of fs.readdirSync(colDir)) {
      const cp = collectionPath(gameId, colId);
      if (!fs.existsSync(cp)) continue;
      const col = readJson<any>(cp, null);
      if (col?.templateId && !col.layoutId) {
        col.layoutId = col.templateId;
        delete col.templateId;
        writeJson(cp, col);
      }
    }
  }

  const oldLayoutPath = path.join(dataRoot, gameId, "layout.json");
  const oldCardsDir = path.join(dataRoot, gameId, "cards");
  const newLayoutsDir = layoutsDir(gameId);
  const newCollectionsDir = collectionsDir(gameId);

  if (fs.existsSync(newLayoutsDir) || fs.existsSync(newCollectionsDir)) return;

  let layoutId = "default";
  if (fs.existsSync(oldLayoutPath)) {
    const layout = readJson<any>(oldLayoutPath, null);
    if (layout) {
      layoutId = layout.id || "default";
      fs.mkdirSync(newLayoutsDir, { recursive: true });
      writeJson(layoutFilePath(gameId, layoutId), layout);
    }
    fs.rmSync(oldLayoutPath);
  } else {
    fs.mkdirSync(newLayoutsDir, { recursive: true });
    writeJson(layoutFilePath(gameId, layoutId), defaultLayout());
  }

  const collId = "default";
  const collection: Collection = { id: collId, name: "Default", layoutId };
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

  const oldFontsDir = path.join(dataRoot, gameId, "fonts");
  if (fs.existsSync(oldFontsDir)) {
    const fontFiles = fs.readdirSync(oldFontsDir);
    for (const file of fontFiles) {
      const src = path.join(oldFontsDir, file);
      const dest = path.join(globalFontsDir, file);
      if (!fs.existsSync(dest)) fs.copyFileSync(src, dest);
    }
    fs.rmSync(oldFontsDir, { recursive: true, force: true });
    const layout = readJson<any>(layoutFilePath(gameId, layoutId), null);
    if (layout?.fonts) {
      const fonts = loadFonts();
      for (const [key, slot] of Object.entries(layout.fonts as Record<string, FontEntry>)) {
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
    const layouts = (() => {
      const dir = layoutsDir(gameId);
      if (!fs.existsSync(dir)) return [];
      return fs.readdirSync(dir)
        .filter((f) => f.endsWith(".json"))
        .map((f) => readJson<any>(path.join(dir, f), null))
        .filter(Boolean);
    })();
    const referencedFiles = new Set<string>();
    for (const t of layouts) {
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

const app = express();
app.use(express.json());

// Games
app.get("/api/games", (_req, res) => res.json(listGames()));

app.post("/api/games", async (req, res) => {
  const name = req.body?.name?.trim();
  if (!name) return res.status(400).json({ error: "Name required" });
  const id = uniqueId(slugify(name) || `game-${Date.now()}`, (id) => fs.existsSync(path.join(dataRoot, id)));
  const now = new Date().toISOString();
  const game: GameMeta = { id, name, createdAt: now, updatedAt: now };
  writeJson(gamePath(id), game);

  const layout = defaultLayout();
  fs.mkdirSync(layoutsDir(id), { recursive: true });
  writeJson(layoutFilePath(id, layout.id), layout);

  const collection: Collection = { id: "default", name: "Default", layoutId: layout.id };
  fs.mkdirSync(collectionCardsDir(id, "default"), { recursive: true });
  writeJson(collectionPath(id, "default"), collection);

  (async () => {
    try {
      const defaults = [{ slot: "title", fontName: "Fraunces" }, { slot: "body", fontName: "Space Grotesk" }];
      for (const { slot, fontName } of defaults) {
        const fonts = loadGameFonts(id);
        if (fonts[slot]?.file) continue;
        try {
          const { data } = await fetchGoogleFont(fontName);
          const hash = hashBuffer(data);
          const fileName = `${hash}.woff2`;
          fs.mkdirSync(gameFontsDir(id), { recursive: true });
          fs.writeFileSync(path.join(gameFontsDir(id), fileName), data);
          const latest = loadGameFonts(id);
          if (!latest[slot]?.file) {
            latest[slot] = { name: fontName, file: fileName, source: "google" };
            saveGameFonts(id, latest);
          }
        } catch { /* non-critical */ }
      }
    } catch { /* non-critical */ }
  })();
  res.status(201).json(game);
});

app.get("/api/games/:gameId", (req, res) => {
  const gameId = req.params.gameId;
  migrateGameIfNeeded(gameId);
  const game = readJson<GameMeta | null>(gamePath(gameId), null);
  if (!game) return res.status(404).json({ error: "Not found" });
  res.json(game);
});

app.put("/api/games/:gameId", (req, res) => {
  const gameId = req.params.gameId;
  const name = req.body?.name?.trim();
  if (!name) return res.status(400).json({ error: "Name required" });
  const game = readJson<GameMeta | null>(gamePath(gameId), null);
  if (!game) return res.status(404).json({ error: "Not found" });
  const updated = { ...game, name, updatedAt: new Date().toISOString() };
  writeJson(gamePath(gameId), updated);
  res.json(updated);
});

app.delete("/api/games/:gameId", (req, res) => {
  fs.rmSync(path.join(dataRoot, req.params.gameId), { recursive: true, force: true });
  res.status(204).end();
});

// Layouts
app.get("/api/games/:gameId/layouts", (req, res) => {
  migrateGameIfNeeded(req.params.gameId);
  res.json(listLayouts(req.params.gameId));
});

app.post("/api/games/:gameId/layouts", (req, res) => {
  const gameId = req.params.gameId;
  const name = req.body?.name?.trim() || "New Layout";
  const layout = defaultLayout();
  layout.id = uniqueId(slugify(name) || "layout", (id) => fs.existsSync(layoutFilePath(gameId, id)));
  layout.name = name;
  writeJson(layoutFilePath(gameId, layout.id), layout);
  touchGame(gameId);
  res.status(201).json(layout);
});

app.get("/api/games/:gameId/layouts/:layoutId", (req, res) => {
  const layout = loadLayout(req.params.gameId, req.params.layoutId);
  if (!layout) return res.status(404).json({ error: "Not found" });
  res.json(layout);
});

app.put("/api/games/:gameId/layouts/:layoutId", (req, res) => {
  const { gameId, layoutId } = req.params;
  if (!req.body) return res.status(400).json({ error: "Layout required" });
  writeJson(layoutFilePath(gameId, layoutId), req.body);
  touchGame(gameId);
  res.json(req.body);
});

app.delete("/api/games/:gameId/layouts/:layoutId", (req, res) => {
  const { gameId, layoutId } = req.params;
  const collections = listCollections(gameId);
  if (collections.some((col) => col.layoutId === layoutId)) return res.status(400).json({ error: "Layout is in use by a collection" });
  fs.rmSync(layoutFilePath(gameId, layoutId), { force: true });
  touchGame(gameId);
  res.status(204).end();
});

app.post("/api/games/:gameId/layouts/:layoutId/copy", (req, res) => {
  const { gameId, layoutId } = req.params;
  const layout = loadLayout(gameId, layoutId);
  if (!layout) return res.status(404).json({ error: "Not found" });
  const existing = listLayouts(gameId);
  const newName = `Layout ${existing.length + 1}`;
  const newId = uniqueId(slugify(newName) || "layout", (id) => fs.existsSync(layoutFilePath(gameId, id)));
  const copy = { ...layout, id: newId, name: newName };
  writeJson(layoutFilePath(gameId, newId), copy);
  touchGame(gameId);
  res.status(201).json(copy);
});

// Collections
app.get("/api/games/:gameId/collections", (req, res) => {
  migrateGameIfNeeded(req.params.gameId);
  res.json(listCollections(req.params.gameId));
});

app.post("/api/games/:gameId/collections", (req, res) => {
  const gameId = req.params.gameId;
  const name = req.body?.name?.trim() || "New Collection";
  const layoutId = req.body?.layoutId;
  if (!layoutId) return res.status(400).json({ error: "layoutId required" });
  if (!loadLayout(gameId, layoutId)) return res.status(404).json({ error: "Layout not found" });
  const id = uniqueId(slugify(name) || "collection", (id) => fs.existsSync(collectionDir(gameId, id)));
  const collection: Collection = { id, name, layoutId };
  fs.mkdirSync(collectionCardsDir(gameId, id), { recursive: true });
  writeJson(collectionPath(gameId, id), collection);
  touchGame(gameId);
  res.status(201).json(collection);
});

app.get("/api/games/:gameId/collections/:collectionId", (req, res) => {
  const col = readJson<Collection | null>(collectionPath(req.params.gameId, req.params.collectionId), null);
  if (!col) return res.status(404).json({ error: "Not found" });
  res.json(col);
});

app.put("/api/games/:gameId/collections/:collectionId", (req, res) => {
  const { gameId, collectionId } = req.params;
  const col = readJson<Collection | null>(collectionPath(gameId, collectionId), null);
  if (!col) return res.status(404).json({ error: "Not found" });
  if (req.body.layoutId && !loadLayout(gameId, req.body.layoutId)) return res.status(404).json({ error: "Layout not found" });
  const updated = { ...col, ...req.body, id: collectionId };
  writeJson(collectionPath(gameId, collectionId), updated);
  touchGame(gameId);
  res.json(updated);
});

app.delete("/api/games/:gameId/collections/:collectionId", (req, res) => {
  fs.rmSync(collectionDir(req.params.gameId, req.params.collectionId), { recursive: true, force: true });
  touchGame(req.params.gameId);
  res.status(204).end();
});

// Cards (within collections)
app.get("/api/games/:gameId/collections/:collectionId/cards", (req, res) => {
  res.json(listCollectionCards(req.params.gameId, req.params.collectionId));
});

app.post("/api/games/:gameId/collections/:collectionId/cards", (req, res) => {
  const { gameId, collectionId } = req.params;
  const name = req.body?.name?.trim();
  if (!name) return res.status(400).json({ error: "Name required" });
  const id = uniqueId(slugify(name) || `card-${Date.now()}`, (id) => fs.existsSync(collectionCardPath(gameId, collectionId, id)));
  const card = normalizeCard({ ...req.body, id });
  writeJson(collectionCardPath(gameId, collectionId, id), card);
  touchGame(gameId);
  res.status(201).json(card);
});

app.get("/api/games/:gameId/collections/:collectionId/cards/:cardId", (req, res) => {
  const { gameId, collectionId } = req.params;
  let cardId = req.params.cardId;
  const isSvg = cardId.endsWith(".svg");
  if (isSvg) cardId = cardId.slice(0, -4);
  const raw = readJson<Partial<CardData> | null>(collectionCardPath(gameId, collectionId, cardId), null);
  if (!raw) return res.status(404).json({ error: "Not found" });
  const card = normalizeCard(raw);
  if (isSvg) {
    const col = readJson<Collection | null>(collectionPath(gameId, collectionId), null);
    const layout = col ? loadLayout(gameId, col.layoutId) : null;
    if (!layout) return res.status(404).json({ error: "Layout not found" });
    const fontData = loadFontData(gameId);
    let svg = renderCardSvg(card, layout, { fonts: fontData });
    svg = embedLocalImages(svg, gameId);
    return res.type("image/svg+xml").send(svg);
  }
  res.json(card);
});

app.put("/api/games/:gameId/collections/:collectionId/cards/:cardId", (req, res) => {
  const { gameId, collectionId, cardId } = req.params;
  const raw = readJson<Partial<CardData> | null>(collectionCardPath(gameId, collectionId, cardId), null);
  const updated = normalizeCard({ ...raw, ...req.body, id: cardId });
  writeJson(collectionCardPath(gameId, collectionId, cardId), updated);
  touchGame(gameId);
  res.status(raw ? 200 : 201).json(updated);
});

app.delete("/api/games/:gameId/collections/:collectionId/cards/:cardId", (req, res) => {
  fs.rmSync(collectionCardPath(req.params.gameId, req.params.collectionId, req.params.cardId), { force: true });
  touchGame(req.params.gameId);
  res.status(204).end();
});

app.post("/api/games/:gameId/collections/:collectionId/cards/:cardId/copy", (req, res) => {
  const { gameId, collectionId, cardId } = req.params;
  const raw = readJson<Partial<CardData> | null>(collectionCardPath(gameId, collectionId, cardId), null);
  if (!raw) return res.status(404).json({ error: "Not found" });
  const card = normalizeCard(raw);
  const existing = listCollectionCards(gameId, collectionId);
  const newName = `New Card ${existing.length + 1}`;
  const newId = uniqueId(slugify(newName) || `card-${Date.now()}`, (id) => fs.existsSync(collectionCardPath(gameId, collectionId, id)));
  const copy = { ...card, id: newId, name: newName };
  writeJson(collectionCardPath(gameId, collectionId, newId), copy);
  touchGame(gameId);
  res.status(201).json(copy);
});

// Render
app.post("/api/games/:gameId/render", (req, res) => {
  const gameId = req.params.gameId;
  const body = req.body;
  const candidate = (body && "card" in body ? body.card : body) ?? {};
  const card = normalizeCard(candidate);
  const layout = body?.layout ?? (body?.layoutId ? loadLayout(gameId, body.layoutId) : null);
  if (!layout) return res.status(400).json({ error: "Layout required (pass layout or layoutId)" });
  const fontData = loadFontData(gameId);
  let svg = renderCardSvg(card, layout, { fonts: fontData });
  svg = embedLocalImages(svg, gameId);
  res.type("image/svg+xml").send(svg);
});

// Fonts (per-game)
app.get("/api/games/:gameId/fonts", (req, res) => res.json(loadGameFonts(req.params.gameId)));

app.post("/api/games/:gameId/fonts/google", async (req, res) => {
  const gameId = req.params.gameId;
  const fontName = req.body?.name?.trim();
  const slotName = req.body?.slotName?.trim();
  if (!fontName) return res.status(400).json({ error: "Font name required" });
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
    res.json({ fonts });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "Failed to fetch font" });
  }
});

app.post("/api/games/:gameId/fonts/upload", express.raw({ type: "*/*", limit: "50mb" }), (req, res) => {
  const gameId = req.params.gameId;
  const disposition = req.headers["content-disposition"] ?? "";
  const filenameMatch = disposition.match(/filename="([^"]+)"/) || disposition.match(/filename=(\S+)/);
  const originalName = filenameMatch ? filenameMatch[1] : "font.woff2";
  const slotName = req.headers["x-slot-name"] as string | undefined;
  const ext = path.extname(originalName).toLowerCase();
  if (![".woff2", ".woff", ".ttf", ".otf"].includes(ext)) {
    return res.status(400).json({ error: `Unsupported font format: ${ext}` });
  }
  const data = Buffer.from(req.body);
  const hash = hashBuffer(data);
  const file = `${hash}${ext}`;
  fs.mkdirSync(gameFontsDir(gameId), { recursive: true });
  fs.writeFileSync(path.join(gameFontsDir(gameId), file), data);
  const fonts = loadGameFonts(gameId);
  const slot = slotName?.trim() || path.basename(originalName, ext).replace(/[-_]+/g, ' ');
  fonts[slot] = { name: path.basename(originalName, ext), file, source: "upload" };
  saveGameFonts(gameId, fonts);
  touchGame(gameId);
  res.json({ fonts });
});

app.get("/api/games/:gameId/fonts/:file", (req, res) => {
  const fp = path.join(gameFontsDir(req.params.gameId), req.params.file);
  if (!fs.existsSync(fp)) return res.status(404).json({ error: "Not found" });
  res.sendFile(fp);
});

app.delete("/api/games/:gameId/fonts/:file", (req, res) => {
  const gameId = req.params.gameId;
  const fontFile = req.params.file;
  fs.rmSync(path.join(gameFontsDir(gameId), fontFile), { force: true });
  const fonts = loadGameFonts(gameId);
  for (const [key, entry] of Object.entries(fonts)) {
    if (entry.file === fontFile) delete fonts[key];
  }
  saveGameFonts(gameId, fonts);
  touchGame(gameId);
  res.json({ fonts });
});

// Images
app.get("/api/games/:gameId/images", (req, res) => {
  const dir = imagesDir(req.params.gameId);
  if (!fs.existsSync(dir)) return res.json([]);
  const files = fs.readdirSync(dir).filter(f => /\.(png|jpg|jpeg|webp|gif|svg)$/i.test(f));
  res.json(files.map(f => ({ file: f, url: `/api/games/${req.params.gameId}/images/${f}` })));
});

app.post("/api/games/:gameId/images/upload", express.raw({ type: "*/*", limit: "50mb" }), (req, res) => {
  const gameId = req.params.gameId;
  const disposition = req.headers["content-disposition"] ?? "";
  const nameMatch = disposition.match(/filename="([^"]+)"/) || disposition.match(/filename=(\S+)/);
  const originalName = nameMatch ? nameMatch[1] : `image-${Date.now()}.png`;
  const ext = (path.extname(originalName) || ".png").toLowerCase();
  if (![".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg"].includes(ext)) {
    return res.status(400).json({ error: "Unsupported image format" });
  }
  const data = Buffer.from(req.body);
  const hash = hashBuffer(data);
  const fileName = `${hash}${ext}`;
  const dir = imagesDir(gameId);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, fileName), data);
  res.status(201).json({ file: fileName, url: `/api/games/${gameId}/images/${fileName}` });
});

app.get("/api/games/:gameId/images/:file", (req, res) => {
  const fp = path.join(imagesDir(req.params.gameId), req.params.file);
  if (!fs.existsSync(fp)) return res.status(404).json({ error: "Not found" });
  res.sendFile(fp);
});

app.delete("/api/games/:gameId/images/:file", (req, res) => {
  fs.rmSync(path.join(imagesDir(req.params.gameId), req.params.file), { force: true });
  res.status(204).end();
});

// TTS export files
app.post("/api/games/:gameId/tts/upload", express.raw({ type: "*/*", limit: "50mb" }), (req, res) => {
  const gameId = req.params.gameId;
  const disposition = req.headers["content-disposition"] ?? "";
  const nameMatch = disposition.match(/filename="([^"]+)"/) || disposition.match(/filename=(\S+)/);
  const fileName = nameMatch ? nameMatch[1] : `atlas-${Date.now()}.png`;
  const data = Buffer.from(req.body);
  const dir = ttsDir(gameId);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, fileName), data);
  res.status(201).json({ file: fileName, url: `/api/games/${gameId}/tts/${fileName}` });
});

app.get("/api/games/:gameId/tts/:file", (req, res) => {
  const fp = path.join(ttsDir(req.params.gameId), req.params.file);
  if (!fs.existsSync(fp)) return res.status(404).json({ error: "Not found" });
  res.sendFile(fp);
});

// Print
app.get("/print/:gameId", (req, res) => {
  const gameId = req.params.gameId;
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
    .sheet { display: grid; grid-layout-columns: repeat(3, 1fr); gap: 12px; padding: 12px; }
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
  res.type("html").send(html);
});

// --- Start ---

app.listen(port, "0.0.0.0", () => {
  console.log(`Editor running at http://localhost:${port}/`);
});
