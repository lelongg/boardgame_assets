import assert from "node:assert/strict";
import { describe, it, before, after } from "node:test";
import "fake-indexeddb/auto";
import { defaultLayout } from "../src/layout.js";
import { createLocalFileStorage } from "../src/storage/localFile.js";
import { createIndexedDBStorage } from "../src/storage/indexedDB.js";
import { createS3Storage } from "../src/storage/s3.js";
import { exportGameZip, importGameZip } from "../src/gameZip.js";
import { getAsset } from "../src/storage/assetCache.js";

// ── Start mock S3 server ──────────────────────────────────────────────────

const S3_PORT = 5198;

async function startS3Mock() {
  const { Hono } = await import("hono");
  const { serve } = await import("@hono/node-server");

  const objects = new Map(); // key → { body: Buffer, contentType: string }
  const app = new Hono();

  // PUT object
  app.put("/:bucket/*", async (c) => {
    const key = c.req.path.replace(`/${c.req.param("bucket")}/`, "");
    const body = Buffer.from(await c.req.arrayBuffer());
    objects.set(key, { body, contentType: c.req.header("content-type") ?? "application/octet-stream" });
    return c.body(null, 200);
  });

  // GET object
  app.get("/:bucket/*", (c) => {
    const key = c.req.path.replace(`/${c.req.param("bucket")}/`, "");
    // ListObjectsV2
    if (c.req.query("list-type") === "2") {
      const prefix = c.req.query("prefix") ?? "";
      const delimiter = c.req.query("delimiter");
      const keys = [...objects.keys()].filter(k => k.startsWith(prefix));
      if (delimiter) {
        const prefixes = new Set();
        const contents = [];
        for (const k of keys) {
          const rest = k.slice(prefix.length);
          const idx = rest.indexOf(delimiter);
          if (idx >= 0) {
            prefixes.add(prefix + rest.slice(0, idx + 1));
          } else {
            contents.push(k);
          }
        }
        const xml = `<?xml version="1.0"?><ListBucketResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/">
          <Name>${c.req.param("bucket")}</Name><Prefix>${prefix}</Prefix><Delimiter>${delimiter}</Delimiter>
          ${contents.map(k => `<Contents><Key>${k}</Key></Contents>`).join("")}
          ${[...prefixes].map(p => `<CommonPrefixes><Prefix>${p}</Prefix></CommonPrefixes>`).join("")}
        </ListBucketResult>`;
        return c.body(xml, { headers: { "Content-Type": "application/xml" } });
      }
      const xml = `<?xml version="1.0"?><ListBucketResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/">
        <Name>${c.req.param("bucket")}</Name><Prefix>${prefix}</Prefix>
        ${keys.map(k => `<Contents><Key>${k}</Key></Contents>`).join("")}
      </ListBucketResult>`;
      return c.body(xml, { headers: { "Content-Type": "application/xml" } });
    }
    const obj = objects.get(key);
    if (!obj) return c.body(null, 404);
    return c.body(obj.body, { headers: { "Content-Type": obj.contentType } });
  });

  // DELETE object
  app.delete("/:bucket/*", (c) => {
    const key = c.req.path.replace(`/${c.req.param("bucket")}/`, "");
    objects.delete(key);
    return c.body(null, 204);
  });

  const server = serve({ fetch: app.fetch, port: S3_PORT });
  return { close: () => server.close() };
}

// ── Start real server for localFile tests ─────────────────────────────────

let serverProcess;
const TEST_PORT = 5199;

async function startServer() {
  const { Hono } = await import("hono");
  const { serve } = await import("@hono/node-server");
  // Import the server app setup — we need to build it fresh with a temp data dir
  const fs = await import("node:fs");
  const path = await import("node:path");
  const os = await import("node:os");
  const crypto = await import("node:crypto");

  const dataRoot = fs.mkdtempSync(path.join(os.tmpdir(), "bgtest-"));

  // Minimal server replicating the real endpoints
  const app = new Hono();

  const readJson = (fp, fallback) => {
    if (!fs.existsSync(fp)) return fallback;
    return JSON.parse(fs.readFileSync(fp, "utf8"));
  };
  const writeJson = (fp, value) => {
    fs.mkdirSync(path.dirname(fp), { recursive: true });
    fs.writeFileSync(fp, JSON.stringify(value, null, 2), "utf8");
  };
  const slug = (v) => v.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  const uid = () => crypto.randomUUID().slice(0, 8);
  const hashBuf = (d) => crypto.createHash("sha256").update(d).digest("hex").slice(0, 12);

  const gamePath = (gid) => path.join(dataRoot, gid, "game.json");
  const layoutsDir = (gid) => path.join(dataRoot, gid, "layouts");
  const tplPath = (gid, tid) => path.join(layoutsDir(gid), `${tid}.json`);
  const colsDir = (gid) => path.join(dataRoot, gid, "collections");
  const colDir = (gid, cid) => path.join(colsDir(gid), cid);
  const colPath = (gid, cid) => path.join(colDir(gid, cid), "collection.json");
  const cardsDir = (gid, cid) => path.join(colDir(gid, cid), "cards");
  const cardPath = (gid, cid, kid) => path.join(cardsDir(gid, cid), `${kid}.json`);
  const fontsDir = (gid) => path.join(dataRoot, gid, "fonts");
  const fontsManifest = (gid) => path.join(fontsDir(gid), "fonts.json");
  const imagesDir = (gid) => path.join(dataRoot, gid, "images");

  // Games
  app.get("/api/games", (c) => {
    if (!fs.existsSync(dataRoot)) return c.json([]);
    const games = fs.readdirSync(dataRoot, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => readJson(gamePath(d.name), null))
      .filter(Boolean);
    return c.json(games);
  });
  app.post("/api/games", async (c) => {
    const { name } = await c.req.json();
    let id = slug(name); let n = 1;
    while (fs.existsSync(path.join(dataRoot, id))) id = `${slug(name)}-${n++}`;
    const game = { id, name, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    writeJson(gamePath(id), game);
    const tpl = defaultLayout();
    writeJson(tplPath(id, tpl.id), tpl);
    writeJson(colPath(id, "default"), { id: "default", name: "Default", layoutId: tpl.id });
    writeJson(fontsManifest(id), {});
    return c.json(game, 201);
  });
  app.get("/api/games/:gid", (c) => {
    const g = readJson(gamePath(c.req.param("gid")), null);
    return g ? c.json(g) : c.json({ error: "Not found" }, 404);
  });
  app.put("/api/games/:gid", async (c) => {
    const gid = c.req.param("gid"); const g = readJson(gamePath(gid), null);
    if (!g) return c.json({ error: "Not found" }, 404);
    const upd = { ...g, ...(await c.req.json()), updatedAt: new Date().toISOString() };
    writeJson(gamePath(gid), upd); return c.json(upd);
  });
  app.delete("/api/games/:gid", (c) => {
    fs.rmSync(path.join(dataRoot, c.req.param("gid")), { recursive: true, force: true });
    return c.json({});
  });

  // Layouts
  app.get("/api/games/:gid/layouts", (c) => {
    const dir = layoutsDir(c.req.param("gid"));
    if (!fs.existsSync(dir)) return c.json([]);
    return c.json(fs.readdirSync(dir).filter(f => f.endsWith(".json")).map(f => readJson(path.join(dir, f), null)).filter(Boolean));
  });
  app.post("/api/games/:gid/layouts", async (c) => {
    const gid = c.req.param("gid"); const { name } = await c.req.json();
    const tpl = { ...defaultLayout(), id: slug(name) || uid(), name };
    writeJson(tplPath(gid, tpl.id), tpl); return c.json(tpl, 201);
  });
  app.get("/api/games/:gid/layouts/:tid", (c) => {
    const t = readJson(tplPath(c.req.param("gid"), c.req.param("tid")), null);
    return t ? c.json(t) : c.json({ error: "Not found" }, 404);
  });
  app.put("/api/games/:gid/layouts/:tid", async (c) => {
    const body = await c.req.json();
    writeJson(tplPath(c.req.param("gid"), c.req.param("tid")), body);
    return c.json(body);
  });
  app.delete("/api/games/:gid/layouts/:tid", (c) => {
    fs.rmSync(tplPath(c.req.param("gid"), c.req.param("tid")), { force: true }); return c.json({});
  });
  app.post("/api/games/:gid/layouts/:tid/copy", (c) => {
    const orig = readJson(tplPath(c.req.param("gid"), c.req.param("tid")), null);
    if (!orig) return c.json({ error: "Not found" }, 404);
    const copy = { ...orig, id: `${orig.id}-copy-${uid()}`, name: `${orig.name} (Copy)` };
    writeJson(tplPath(c.req.param("gid"), copy.id), copy); return c.json(copy, 201);
  });

  // Collections
  app.get("/api/games/:gid/collections", (c) => {
    const dir = colsDir(c.req.param("gid"));
    if (!fs.existsSync(dir)) return c.json([]);
    return c.json(fs.readdirSync(dir, { withFileTypes: true }).filter(d => d.isDirectory())
      .map(d => readJson(colPath(c.req.param("gid"), d.name), null)).filter(Boolean));
  });
  app.post("/api/games/:gid/collections", async (c) => {
    const gid = c.req.param("gid"); const { name, layoutId } = await c.req.json();
    let id = slug(name); let n = 1;
    while (fs.existsSync(colDir(gid, id))) id = `${slug(name)}-${n++}`;
    const col = { id, name, layoutId };
    writeJson(colPath(gid, id), col); return c.json(col, 201);
  });
  app.get("/api/games/:gid/collections/:cid", (c) => {
    const col = readJson(colPath(c.req.param("gid"), c.req.param("cid")), null);
    return col ? c.json(col) : c.json({ error: "Not found" }, 404);
  });
  app.put("/api/games/:gid/collections/:cid", async (c) => {
    const gid = c.req.param("gid"), cid = c.req.param("cid");
    const col = readJson(colPath(gid, cid), null);
    if (!col) return c.json({ error: "Not found" }, 404);
    const upd = { ...col, ...(await c.req.json()) };
    writeJson(colPath(gid, cid), upd); return c.json(upd);
  });
  app.delete("/api/games/:gid/collections/:cid", (c) => {
    fs.rmSync(colDir(c.req.param("gid"), c.req.param("cid")), { recursive: true, force: true }); return c.json({});
  });

  // Cards
  app.get("/api/games/:gid/collections/:cid/cards", (c) => {
    const dir = cardsDir(c.req.param("gid"), c.req.param("cid"));
    if (!fs.existsSync(dir)) return c.json([]);
    return c.json(fs.readdirSync(dir).filter(f => f.endsWith(".json")).map(f => readJson(path.join(dir, f), null)).filter(Boolean));
  });
  app.get("/api/games/:gid/collections/:cid/cards/:kid", (c) => {
    const card = readJson(cardPath(c.req.param("gid"), c.req.param("cid"), c.req.param("kid")), null);
    return card ? c.json(card) : c.json({ error: "Not found" }, 404);
  });
  app.put("/api/games/:gid/collections/:cid/cards/:kid", async (c) => {
    const body = await c.req.json();
    writeJson(cardPath(c.req.param("gid"), c.req.param("cid"), c.req.param("kid")), body);
    return c.json(body);
  });
  app.delete("/api/games/:gid/collections/:cid/cards/:kid", (c) => {
    fs.rmSync(cardPath(c.req.param("gid"), c.req.param("cid"), c.req.param("kid")), { force: true }); return c.json({});
  });
  app.post("/api/games/:gid/collections/:cid/cards/:kid/copy", (c) => {
    const orig = readJson(cardPath(c.req.param("gid"), c.req.param("cid"), c.req.param("kid")), null);
    if (!orig) return c.json({ error: "Not found" }, 404);
    const copy = { ...orig, id: uid(), name: `${orig.name} (Copy)` };
    writeJson(cardPath(c.req.param("gid"), c.req.param("cid"), copy.id), copy); return c.json(copy, 201);
  });

  // Fonts
  app.get("/api/games/:gid/fonts", (c) => c.json(readJson(fontsManifest(c.req.param("gid")), {})));
  app.post("/api/games/:gid/fonts/google", async (c) => {
    const gid = c.req.param("gid"); const { name, slotName } = await c.req.json();
    const fonts = readJson(fontsManifest(gid), {});
    const slot = slotName || slug(name);
    // Fake font download — just create a file
    const fileName = hashBuf(Buffer.from(name)) + ".woff2";
    fs.mkdirSync(fontsDir(gid), { recursive: true });
    fs.writeFileSync(path.join(fontsDir(gid), fileName), `fake-font-${name}`);
    fonts[slot] = { name, file: fileName, source: "google" };
    writeJson(fontsManifest(gid), fonts);
    return c.json({ fonts });
  });
  app.post("/api/games/:gid/fonts/upload", async (c) => {
    const gid = c.req.param("gid");
    const disposition = c.req.header("content-disposition") ?? "";
    const fnMatch = disposition.match(/filename="([^"]+)"/) || disposition.match(/filename=(\S+)/);
    const originalName = fnMatch ? fnMatch[1] : "font.woff2";
    const slotName = c.req.header("x-slot-name");
    const ext = path.extname(originalName).toLowerCase();
    if (![".woff2", ".woff", ".ttf", ".otf"].includes(ext)) {
      return c.json({ error: `Unsupported font format: ${ext}` }, 400);
    }
    const data = Buffer.from(await c.req.arrayBuffer());
    const fileName = hashBuf(data) + ext;
    fs.mkdirSync(fontsDir(gid), { recursive: true });
    fs.writeFileSync(path.join(fontsDir(gid), fileName), data);
    const fonts = readJson(fontsManifest(gid), {});
    const slot = slotName?.trim() || path.basename(originalName, ext).replace(/[-_]+/g, " ");
    fonts[slot] = { name: path.basename(originalName, ext), file: fileName, source: "upload" };
    writeJson(fontsManifest(gid), fonts);
    return c.json({ fonts });
  });
  app.get("/api/games/:gid/fonts/:file", (c) => {
    const fp = path.join(fontsDir(c.req.param("gid")), c.req.param("file"));
    if (!fs.existsSync(fp)) return c.json({ error: "Not found" }, 404);
    return c.body(fs.readFileSync(fp), { headers: { "Content-Type": "font/woff2" } });
  });
  app.delete("/api/games/:gid/fonts/:file", (c) => {
    const gid = c.req.param("gid"), file = c.req.param("file");
    fs.rmSync(path.join(fontsDir(gid), file), { force: true });
    const fonts = readJson(fontsManifest(gid), {});
    for (const [k, v] of Object.entries(fonts)) { if (v.file === file) delete fonts[k]; }
    writeJson(fontsManifest(gid), fonts);
    return c.json({ fonts });
  });

  // Images
  app.post("/api/games/:gid/images/upload", async (c) => {
    const gid = c.req.param("gid");
    const disposition = c.req.header("content-disposition") ?? "";
    const fnMatch = disposition.match(/filename="([^"]+)"/) || disposition.match(/filename=(\S+)/);
    const originalName = fnMatch ? fnMatch[1] : `image-${Date.now()}.png`;
    const ext = (path.extname(originalName) || ".png").toLowerCase();
    const data = Buffer.from(await c.req.arrayBuffer());
    const fileName = hashBuf(data) + ext;
    const dir = imagesDir(gid);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, fileName), data);
    return c.json({ file: fileName, url: `/api/games/${gid}/images/${fileName}` }, 201);
  });
  app.get("/api/games/:gid/images/:file", (c) => {
    const fp = path.join(imagesDir(c.req.param("gid")), c.req.param("file"));
    if (!fs.existsSync(fp)) return c.json({ error: "Not found" }, 404);
    return c.body(fs.readFileSync(fp), { headers: { "Content-Type": "image/png" } });
  });

  serverProcess = serve({ fetch: app.fetch, port: TEST_PORT });
  // Override fetch: route /api/ to test server with asset cache fallback, mock Google Fonts
  const ASSET_PATTERN = /^\/api\/games\/[^/]+\/(fonts|images)\/[^/]+$/;
  const origFetch = globalThis.fetch;
  globalThis.fetch = async (url, opts) => {
    if (typeof url === "string" && url.startsWith("/api/")) {
      // Try real server first
      try {
        const resp = await origFetch(`http://localhost:${TEST_PORT}${url}`, opts);
        if (resp.ok) return resp;
      } catch { /* server miss */ }
      // Fall back to asset cache (for IndexedDB-stored binaries)
      if (ASSET_PATTERN.test(url)) {
        const entry = await getAsset(url);
        if (entry) return new Response(entry.blob, { headers: { "Content-Type": entry.mimeType } });
      }
      return new Response(JSON.stringify({ error: "Not found" }), { status: 404 });
    }
    // Mock Google Fonts CSS responses for IndexedDB addGoogleFont
    if (typeof url === "string" && url.includes("fonts.googleapis.com")) {
      const fakeCss = `@font-face { src: url(https://fonts.gstatic.com/fake-font.woff2) format('woff2'); }`;
      return new Response(fakeCss);
    }
    // Mock font binary download from gstatic
    if (typeof url === "string" && url.includes("fonts.gstatic.com")) {
      return new Response(new Uint8Array([0, 1, 2, 3]));
    }
    return origFetch(url, opts);
  };

  return { cleanup: () => { serverProcess.close(); globalThis.fetch = origFetch; fs.rmSync(dataRoot, { recursive: true, force: true }); } };
}

/**
 * Shared backend compatibility test suite.
 */
function backendCompatSuite(name, createStorage) {
  describe(`${name}: backend compatibility`, () => {
    let storage, gameId, layoutId, collectionId, cardId;

    before(async () => { storage = await createStorage(); if (storage.init) await storage.init(); });

    it("createGame returns a game with id and name", async () => {
      const game = await storage.createGame("Test Game");
      assert.ok(game.id); assert.equal(game.name, "Test Game"); gameId = game.id;
    });
    it("listGames includes the created game", async () => {
      const games = await storage.listGames();
      assert.ok(games.find(g => g.id === gameId));
    });
    it("getGame returns the game by id", async () => {
      const game = await storage.getGame(gameId);
      assert.equal(game.id, gameId); assert.equal(game.name, "Test Game");
    });
    it("updateGame changes the game name", async () => {
      await storage.updateGame(gameId, { name: "Renamed" });
      assert.equal((await storage.getGame(gameId)).name, "Renamed");
    });

    it("listLayouts returns at least the default layout", async () => {
      const layouts = await storage.listLayouts(gameId);
      assert.ok(layouts.length >= 1); layoutId = layouts[0].id;
    });
    it("getLayout returns the layout", async () => {
      const tpl = await storage.getLayout(gameId, layoutId);
      assert.ok(tpl); assert.ok(tpl.root);
    });
    it("saveLayout updates the layout", async () => {
      const tpl = await storage.getLayout(gameId, layoutId);
      tpl.name = "Updated"; const saved = await storage.saveLayout(gameId, layoutId, tpl);
      assert.equal(saved.name, "Updated");
    });
    it("createLayout creates a new layout", async () => {
      const tpl = await storage.createLayout(gameId, "Second");
      assert.ok(tpl.id); await storage.deleteLayout(gameId, tpl.id);
    });

    it("listCollections returns at least the default collection", async () => {
      const cols = await storage.listCollections(gameId);
      assert.ok(cols.length >= 1); collectionId = cols[0].id;
    });
    it("getCollection returns the collection", async () => {
      const col = await storage.getCollection(gameId, collectionId);
      assert.ok(col); assert.equal(col.layoutId, layoutId);
    });
    it("createCollection creates a new collection", async () => {
      const col = await storage.createCollection(gameId, "Second", layoutId);
      assert.ok(col.id); await storage.deleteCollection(gameId, col.id);
    });
    it("updateCollection renames the collection", async () => {
      const upd = await storage.updateCollection(gameId, collectionId, { name: "Renamed Col" });
      assert.equal(upd.name, "Renamed Col");
    });

    it("saveCard creates a new card", async () => {
      const card = await storage.saveCard(gameId, collectionId, "test-card", {
        id: "test-card", name: "Test Card", fields: { cost: "3", description: "A test" },
      });
      assert.ok(card.id); cardId = card.id;
    });
    it("listCards includes the created card", async () => {
      const cards = await storage.listCards(gameId, collectionId);
      assert.ok(cards.find(c => c.id === cardId));
    });
    it("getCard returns the card", async () => {
      const card = await storage.getCard(gameId, collectionId, cardId);
      assert.equal(card.fields.description, "A test");
    });
    it("saveCard updates an existing card", async () => {
      const upd = await storage.saveCard(gameId, collectionId, cardId, {
        id: cardId, name: "Updated Card", fields: { cost: "5" },
      });
      assert.equal(upd.name, "Updated Card");
    });
    it("copyCard duplicates the card", async () => {
      const copy = await storage.copyCard(gameId, collectionId, cardId);
      assert.ok(copy.id !== cardId);
      await storage.deleteCard(gameId, collectionId, copy.id);
    });
    it("deleteCard removes the card", async () => {
      await storage.deleteCard(gameId, collectionId, cardId);
      const cards = await storage.listCards(gameId, collectionId);
      assert.ok(!cards.find(c => c.id === cardId));
    });

    it("listFonts returns a Record (object, not array)", async () => {
      const fonts = await storage.listFonts(gameId);
      assert.ok(typeof fonts === "object" && !Array.isArray(fonts));
    });
    it("isAuthorized returns a boolean", () => {
      assert.equal(typeof storage.isAuthorized(), "boolean");
    });
    it("deleteGame removes the game", async () => {
      await storage.deleteGame(gameId);
      assert.ok(!(await storage.listGames()).find(g => g.id === gameId));
    });
  });
}

// ── Helper: create a full test game ───────────────────────────────────────

async function createFullTestGame(storage) {
  const game = await storage.createGame("Transfer Test");
  const gameId = game.id;

  // Upload fonts with realistic names (spaces!)
  await storage.addGoogleFont(gameId, "Playwrite IE", "title");
  await storage.addGoogleFont(gameId, "Space Grotesk", "body");

  // Upload an image
  const fakeImage = new File([new Uint8Array([137, 80, 78, 71])], "hero artwork.png", { type: "image/png" });
  const imageUrl = await storage.uploadImage(gameId, fakeImage);

  // Build layout with all item types
  const layouts = await storage.listLayouts(gameId);
  const tpl = layouts[0];
  tpl.name = "Full Layout";
  tpl.width = 70;
  tpl.height = 120;
  tpl.radius = 3;
  tpl.bleed = 2;
  tpl.bindingMeta = {
    "defaultValue:name": { values: ["Warrior", "Mage", "Rogue"] },
    "emoji:faction": { default: "⚔️", values: ["⚔️", "🛡️", "🔮", "🏹"] },
  };
  tpl.root = {
    id: "root", name: "Root", layout: "column", sizePct: 100, gap: 12, columns: 2,
    children: [
      { id: "header", name: "Header", layout: "row", sizePct: 30, gap: 8, columns: 2, children: [], items: [
        { id: "title-item", name: "Title", type: "text", defaultValue: "Untitled",
          bindings: { defaultValue: { field: "name" } },
          fontSize: 32, align: "center", verticalAlign: "middle", font: "title", color: "#1a1a2e",
          anchor: { x: 0.5, y: 0.5 }, attach: { targetType: "section", targetId: "header", anchor: { x: 0.5, y: 0.5 } },
          widthPct: 100, heightPct: 100 },
      ]},
      { id: "body", name: "Body", layout: "stack", sizePct: 70, gap: 0, columns: 2,
        children: [
          { id: "grid-section", name: "Grid", layout: "grid", sizePct: 60, gap: 4, columns: 3, children: [], items: [
            { id: "art-item", name: "Artwork", type: "image", defaultValue: imageUrl,
              bindings: { defaultValue: { field: "image" } },
              fit: "cover", cornerRadius: 12,
              anchor: { x: 0.5, y: 0 }, attach: { targetType: "section", targetId: "grid-section", anchor: { x: 0.5, y: 0 } },
              widthPct: 100, heightPct: 80 },
          ]},
        ],
        items: [
          { id: "border-item", name: "Border", type: "frame",
            strokeWidth: 3, strokeColor: "#16213e", fillColor: "none", cornerRadius: 8,
            anchor: { x: 0.5, y: 0.5 }, attach: { targetType: "section", targetId: "body", anchor: { x: 0.5, y: 0.5 } },
            widthPct: 95, heightPct: 95 },
          { id: "emoji-item", name: "Faction", type: "emoji", emoji: "⚔️",
            bindings: { emoji: { field: "faction" } },
            fontSize: 48,
            anchor: { x: 0.5, y: 1 }, attach: { targetType: "section", targetId: "body", anchor: { x: 0.5, y: 1 } },
            widthPct: 15, heightPct: 10 },
          { id: "desc-item", name: "Description", type: "text", defaultValue: "",
            bindings: { defaultValue: { field: "description" } },
            fontSize: 14, align: "left", verticalAlign: "top", color: "#333",
            anchor: { x: 0, y: 0 }, attach: { targetType: "item", targetId: "art-item", anchor: { x: 0, y: 1 } },
            widthPct: 90, heightPct: 30 },
        ],
      },
    ],
    items: [],
  };
  await storage.saveLayout(gameId, tpl.id, tpl);

  // Cards
  const cols = await storage.listCollections(gameId);
  await storage.saveCard(gameId, cols[0].id, "card-1", {
    id: "card-1", name: "Warrior",
    fields: { cost: "5", description: "<b>Brave</b> hero", image: imageUrl, faction: "⚔️" },
  });
  await storage.saveCard(gameId, cols[0].id, "card-2", {
    id: "card-2", name: "Mage",
    fields: { cost: "3", description: "*Wise* mage", faction: "🔮" },
  });

  // Second collection
  const col2 = await storage.createCollection(gameId, "Expansion", tpl.id);
  await storage.saveCard(gameId, col2.id, "card-3", {
    id: "card-3", name: "Rogue",
    fields: { cost: "4", faction: "🏹" },
  });

  return { gameId, layoutId: tpl.id };
}

async function verifyFullTestGame(storage, gameId) {
  const game = await storage.getGame(gameId);
  assert.equal(game.name, "Transfer Test");

  const layouts = await storage.listLayouts(gameId);
  assert.equal(layouts.length, 1);
  const tpl = layouts[0];
  assert.equal(tpl.name, "Full Layout");
  assert.equal(tpl.width, 70);
  assert.equal(tpl.height, 120);
  assert.equal(tpl.radius, 3);
  assert.equal(tpl.bleed, 2);

  // Collect all items
  const items = [];
  function collect(s) { items.push(...(s.items || [])); (s.children || []).forEach(collect); }
  collect(tpl.root);
  assert.equal(items.length, 5, `expected 5 items, got ${items.length}: ${items.map(i => i.name).join(", ")}`);

  // Text item
  const title = items.find(i => i.id === "title-item");
  assert.ok(title); assert.equal(title.type, "text");
  assert.equal(title.bindings?.defaultValue?.field, "name"); assert.equal(title.defaultValue, "Untitled");
  assert.deepEqual(tpl.bindingMeta?.["defaultValue:name"]?.values, ["Warrior", "Mage", "Rogue"]);
  assert.equal(title.fontSize, 32); assert.equal(title.align, "center");
  assert.equal(title.font, "title"); assert.equal(title.color, "#1a1a2e");

  // Frame item
  const border = items.find(i => i.id === "border-item");
  assert.ok(border); assert.equal(border.type, "frame");
  assert.equal(border.strokeWidth, 3); assert.equal(border.cornerRadius, 8);

  // Image item
  const art = items.find(i => i.id === "art-item");
  assert.ok(art); assert.equal(art.type, "image");
  assert.equal(art.fit, "cover"); assert.equal(art.cornerRadius, 12);
  assert.ok(art.defaultValue.includes(`/api/games/${gameId}/images/`), "image URL should reference the game");

  // Emoji item
  const emoji = items.find(i => i.id === "emoji-item");
  assert.ok(emoji); assert.equal(emoji.type, "emoji");
  assert.equal(emoji.bindings?.emoji?.field, "faction"); assert.equal(emoji.emoji, "⚔️");
  assert.deepEqual(tpl.bindingMeta?.["emoji:faction"]?.values, ["⚔️", "🛡️", "🔮", "🏹"]);
  assert.equal(emoji.fontSize, 48);

  // Description attached to item
  const desc = items.find(i => i.id === "desc-item");
  assert.ok(desc); assert.equal(desc.attach.targetType, "item");
  assert.equal(desc.attach.targetId, "art-item");

  // Grid section
  const grid = tpl.root.children.find(c => c.children?.some(cc => cc.id === "grid-section"));
  const gridSection = grid?.children?.find(cc => cc.id === "grid-section") ?? tpl.root.children.flatMap(c => c.children || []).find(cc => cc.id === "grid-section");
  assert.ok(gridSection); assert.equal(gridSection.layout, "grid"); assert.equal(gridSection.columns, 3);

  // Collections
  const cols = await storage.listCollections(gameId);
  assert.equal(cols.length, 2);
  assert.deepEqual(cols.map(c => c.name).sort(), ["Default", "Expansion"]);

  // Cards
  const defCol = cols.find(c => c.name === "Default");
  const defCards = await storage.listCards(gameId, defCol.id);
  assert.equal(defCards.length, 2);
  const warrior = defCards.find(c => c.name === "Warrior");
  assert.ok(warrior); assert.equal(warrior.fields.faction, "⚔️");
  assert.equal(warrior.fields.cost, "5");
  assert.ok(warrior.fields.image.includes(`/api/games/${gameId}/images/`));

  const expCol = cols.find(c => c.name === "Expansion");
  const expCards = await storage.listCards(gameId, expCol.id);
  assert.equal(expCards.length, 1);
  assert.equal(expCards[0].fields.faction, "🏹");

  // Fonts
  const fonts = await storage.listFonts(gameId);
  assert.ok(typeof fonts === "object" && !Array.isArray(fonts));
  const fontSlots = Object.keys(fonts);
  assert.ok(fontSlots.includes("title"), `expected 'title' font slot, got: ${fontSlots}`);
  assert.ok(fontSlots.includes("body"), `expected 'body' font slot, got: ${fontSlots}`);
}

// ── Run suites ────────────────────────────────────────────────────────────
// Single server for all tests

let serverCleanup;
let s3Mock;
const S3_BUCKET = "test-bucket";

before(async () => {
  serverCleanup = (await startServer()).cleanup;
  s3Mock = await startS3Mock();
});
after(async () => {
  serverCleanup?.();
  if (s3Mock) s3Mock.close();
});

const createTestS3 = () => createS3Storage({
  defaultLayout,
  bucket: S3_BUCKET,
  region: "us-east-1",
  accessKeyId: "S3RVER",
  secretAccessKey: "S3RVER",
  endpoint: `http://127.0.0.1:${S3_PORT}`,
  prefix: "test-" + Math.random().toString(36).slice(2, 8),
});

describe("localFile backend (real server)", () => {
  backendCompatSuite("localFile", async () => createLocalFileStorage({ defaultLayout }));
});

describe("indexedDB backend", () => {
  backendCompatSuite("indexedDB", async () => createIndexedDBStorage({ defaultLayout }));
});

describe("s3 backend (s3rver)", () => {
  backendCompatSuite("s3", async () => createTestS3());
});

describe("round-trip: same backend", () => {
  it("localFile → zip → localFile preserves all data", async () => {
    const src = createLocalFileStorage({ defaultLayout });
    const { gameId } = await createFullTestGame(src);
    const zip = await (await exportGameZip(src, gameId)).arrayBuffer();
    const dst = createLocalFileStorage({ defaultLayout });
    const newId = await importGameZip(dst, zip);
    await verifyFullTestGame(dst, newId);
  });

  it("indexedDB → zip → indexedDB preserves all data", async () => {
    const src = createIndexedDBStorage({ defaultLayout });
    const { gameId } = await createFullTestGame(src);
    const zip = await (await exportGameZip(src, gameId)).arrayBuffer();
    const dst = createIndexedDBStorage({ defaultLayout });
    const newId = await importGameZip(dst, zip);
    await verifyFullTestGame(dst, newId);
  });

  it("s3 → zip → s3 preserves all data", async () => {
    const src = createTestS3();
    const { gameId } = await createFullTestGame(src);
    const zip = await (await exportGameZip(src, gameId)).arrayBuffer();
    const dst = createTestS3();
    const newId = await importGameZip(dst, zip);
    await verifyFullTestGame(dst, newId);
  });
});

describe("round-trip: cross-backend", () => {
  it("localFile → zip → indexedDB preserves all data", async () => {
    const src = createLocalFileStorage({ defaultLayout });
    const { gameId } = await createFullTestGame(src);
    const zip = await (await exportGameZip(src, gameId)).arrayBuffer();
    const dst = createIndexedDBStorage({ defaultLayout });
    const newId = await importGameZip(dst, zip);
    await verifyFullTestGame(dst, newId);
  });

  it("indexedDB → zip → localFile preserves all data", async () => {
    const src = createIndexedDBStorage({ defaultLayout });
    const { gameId } = await createFullTestGame(src);
    const zip = await (await exportGameZip(src, gameId)).arrayBuffer();
    const dst = createLocalFileStorage({ defaultLayout });
    const newId = await importGameZip(dst, zip);
    await verifyFullTestGame(dst, newId);
  });

  it("s3 → zip → localFile preserves all data", async () => {
    const src = createTestS3();
    const { gameId } = await createFullTestGame(src);
    const zip = await (await exportGameZip(src, gameId)).arrayBuffer();
    const dst = createLocalFileStorage({ defaultLayout });
    const newId = await importGameZip(dst, zip);
    await verifyFullTestGame(dst, newId);
  });

  it("localFile → zip → s3 preserves all data", async () => {
    const src = createLocalFileStorage({ defaultLayout });
    const { gameId } = await createFullTestGame(src);
    const zip = await (await exportGameZip(src, gameId)).arrayBuffer();
    const dst = createTestS3();
    const newId = await importGameZip(dst, zip);
    await verifyFullTestGame(dst, newId);
  });

  it("localFile → zip → indexedDB → zip → localFile survives double transfer", async () => {
    const src = createLocalFileStorage({ defaultLayout });
    const { gameId } = await createFullTestGame(src);
    const zip1 = await (await exportGameZip(src, gameId)).arrayBuffer();
    const mid = createIndexedDBStorage({ defaultLayout });
    const midId = await importGameZip(mid, zip1);
    const zip2 = await (await exportGameZip(mid, midId)).arrayBuffer();
    const dst = createLocalFileStorage({ defaultLayout });
    const finalId = await importGameZip(dst, zip2);
    await verifyFullTestGame(dst, finalId);
  });

  it("preserves special characters through transfer", async () => {
    const src = createLocalFileStorage({ defaultLayout });
    const game = await src.createGame("Special Chars");
    const cols = await src.listCollections(game.id);
    await src.saveCard(game.id, cols[0].id, "card-special", {
      id: "card-special", name: 'Card with "quotes" & <tags>',
      fields: { text: "Line 1\nLine 2", emoji: "⚔️🛡️", html: "<b>Bold</b>" },
    });
    const zip = await (await exportGameZip(src, game.id)).arrayBuffer();
    const dst = createIndexedDBStorage({ defaultLayout });
    const newId = await importGameZip(dst, zip);
    const newCols = await dst.listCollections(newId);
    const cards = await dst.listCards(newId, newCols[0].id);
    const card = cards.find(c => c.id === "card-special");
    assert.ok(card);
    assert.equal(card.name, 'Card with "quotes" & <tags>');
    assert.equal(card.fields.emoji, "⚔️🛡️");
    assert.equal(card.fields.html, "<b>Bold</b>");
  });
});
