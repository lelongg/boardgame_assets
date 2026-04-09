import assert from "node:assert/strict";
import { describe, it, before, after, mock } from "node:test";
import { defaultTemplate } from "../src/template.js";
import { createLocalFileStorage } from "../src/storage/localFile.js";
import { exportGameZip, importGameZip } from "../src/gameZip.js";

/**
 * Shared backend compatibility test suite.
 * Verifies that a storage backend correctly implements the full Storage interface.
 */
function backendCompatSuite(name, createStorage) {
  describe(`${name}: backend compatibility`, () => {
    let storage;
    let gameId;
    let templateId;
    let collectionId;
    let cardId;

    before(async () => {
      storage = await createStorage();
      if (storage.init) await storage.init();
    });

    // ── Games ──────────────────────────────────────────────────────────

    it("createGame returns a game with id and name", async () => {
      const game = await storage.createGame("Test Game");
      assert.ok(game.id, "game should have an id");
      assert.equal(game.name, "Test Game");
      gameId = game.id;
    });

    it("listGames includes the created game", async () => {
      const games = await storage.listGames();
      const found = games.find((g) => g.id === gameId);
      assert.ok(found, "created game should appear in list");
      assert.equal(found.name, "Test Game");
    });

    it("getGame returns the game by id", async () => {
      const game = await storage.getGame(gameId);
      assert.equal(game.id, gameId);
      assert.equal(game.name, "Test Game");
    });

    it("updateGame changes the game name", async () => {
      const updated = await storage.updateGame(gameId, { name: "Renamed" });
      assert.equal(updated.name, "Renamed");
      const fetched = await storage.getGame(gameId);
      assert.equal(fetched.name, "Renamed");
    });

    // ── Templates ─────────────────────────────────────────────────────

    it("listTemplates returns at least the default template", async () => {
      const templates = await storage.listTemplates(gameId);
      assert.ok(templates.length >= 1, "should have at least one template");
      templateId = templates[0].id;
    });

    it("getTemplate returns the template", async () => {
      const tpl = await storage.getTemplate(gameId, templateId);
      assert.ok(tpl, "template should exist");
      assert.equal(tpl.id, templateId);
      assert.ok(tpl.root, "template should have a root section");
    });

    it("saveTemplate updates the template", async () => {
      const tpl = await storage.getTemplate(gameId, templateId);
      tpl.name = "Updated Template";
      const saved = await storage.saveTemplate(gameId, templateId, tpl);
      assert.equal(saved.name, "Updated Template");
    });

    it("createTemplate creates a new template", async () => {
      const tpl = await storage.createTemplate(gameId, "Second Template");
      assert.ok(tpl.id, "new template should have an id");
      assert.equal(tpl.name, "Second Template");
      // Clean up
      await storage.deleteTemplate(gameId, tpl.id);
    });

    // ── Collections ───────────────────────────────────────────────────

    it("listCollections returns at least the default collection", async () => {
      const cols = await storage.listCollections(gameId);
      assert.ok(cols.length >= 1, "should have at least one collection");
      collectionId = cols[0].id;
    });

    it("getCollection returns the collection", async () => {
      const col = await storage.getCollection(gameId, collectionId);
      assert.ok(col, "collection should exist");
      assert.equal(col.id, collectionId);
      assert.equal(col.templateId, templateId);
    });

    it("createCollection creates a new collection", async () => {
      const col = await storage.createCollection(gameId, "Second", templateId);
      assert.ok(col.id, "new collection should have an id");
      assert.equal(col.name, "Second");
      assert.equal(col.templateId, templateId);
      // Clean up
      await storage.deleteCollection(gameId, col.id);
    });

    it("updateCollection renames the collection", async () => {
      const updated = await storage.updateCollection(gameId, collectionId, { name: "Renamed Col" });
      assert.equal(updated.name, "Renamed Col");
    });

    // ── Cards ─────────────────────────────────────────────────────────

    it("saveCard creates a new card", async () => {
      const card = await storage.saveCard(gameId, collectionId, "test-card", {
        id: "test-card",
        name: "Test Card",
        fields: { cost: "3", description: "A test" },
      });
      assert.ok(card.id, "card should have an id");
      assert.equal(card.name, "Test Card");
      cardId = card.id;
    });

    it("listCards includes the created card", async () => {
      const cards = await storage.listCards(gameId, collectionId);
      const found = cards.find((c) => c.id === cardId);
      assert.ok(found, "card should appear in list");
      assert.equal(found.fields.cost, "3");
    });

    it("getCard returns the card", async () => {
      const card = await storage.getCard(gameId, collectionId, cardId);
      assert.equal(card.id, cardId);
      assert.equal(card.name, "Test Card");
      assert.equal(card.fields.description, "A test");
    });

    it("saveCard updates an existing card", async () => {
      const updated = await storage.saveCard(gameId, collectionId, cardId, {
        id: cardId,
        name: "Updated Card",
        fields: { cost: "5" },
      });
      assert.equal(updated.name, "Updated Card");
      assert.equal(updated.fields.cost, "5");
    });

    it("copyCard duplicates the card", async () => {
      const copy = await storage.copyCard(gameId, collectionId, cardId);
      assert.ok(copy.id !== cardId, "copy should have a different id");
      assert.ok(copy.name.includes("Copy") || copy.name.includes("copy"), "copy name should indicate it's a copy");
      // Clean up
      await storage.deleteCard(gameId, collectionId, copy.id);
    });

    it("deleteCard removes the card", async () => {
      await storage.deleteCard(gameId, collectionId, cardId);
      const cards = await storage.listCards(gameId, collectionId);
      const found = cards.find((c) => c.id === cardId);
      assert.ok(!found, "deleted card should not appear in list");
    });

    // ── Fonts ─────────────────────────────────────────────────────────

    it("listFonts returns a Record (object, not array)", async () => {
      const fonts = await storage.listFonts(gameId);
      assert.ok(typeof fonts === "object" && !Array.isArray(fonts), "fonts should be a plain object");
    });

    // ── Auth (no-op for local/indexedDB) ──────────────────────────────

    it("isAuthorized returns a boolean", () => {
      const result = storage.isAuthorized();
      assert.equal(typeof result, "boolean");
    });

    // ── Cleanup ───────────────────────────────────────────────────────

    it("deleteGame removes the game", async () => {
      await storage.deleteGame(gameId);
      const games = await storage.listGames();
      const found = games.find((g) => g.id === gameId);
      assert.ok(!found, "deleted game should not appear in list");
    });
  });
}

// ── Mock fetch for localFile backend ──────────────────────────────────────

function createMockFetchForLocalFile() {
  const data = { games: {}, templates: {}, collections: {}, cards: {}, fonts: {} };
  const slug = (v) => v.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  const uid = () => Math.random().toString(36).slice(2, 10);

  return mock.fn(async (url, opts = {}) => {
    const method = opts.method || "GET";
    const json = () => opts.body ? JSON.parse(opts.body) : {};
    const ok = (body) => ({ ok: true, json: async () => body, status: 200 });
    const created = (body) => ({ ok: true, json: async () => body, status: 201 });
    const notFound = () => ({ ok: false, status: 404, json: async () => ({ error: "Not found" }) });

    let m;

    // Games
    if (url === "/api/games" && method === "GET") return ok(Object.values(data.games));
    if (url === "/api/games" && method === "POST") {
      const b = json(); const id = slug(b.name) || uid();
      const game = { id, name: b.name, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
      data.games[id] = game;
      data.templates[id] = {};
      data.collections[id] = {};
      data.cards[id] = {};
      data.fonts[id] = {};
      // Create default template and collection
      const tpl = defaultTemplate();
      data.templates[id][tpl.id] = tpl;
      data.collections[id]["default"] = { id: "default", name: "Default", templateId: tpl.id };
      data.cards[id]["default"] = {};
      return created(game);
    }
    if ((m = url.match(/^\/api\/games\/([^/]+)$/))) {
      const gid = m[1];
      if (method === "GET") return data.games[gid] ? ok(data.games[gid]) : notFound();
      if (method === "PUT") {
        if (!data.games[gid]) return notFound();
        Object.assign(data.games[gid], json(), { updatedAt: new Date().toISOString() });
        return ok(data.games[gid]);
      }
      if (method === "DELETE") {
        delete data.games[gid]; delete data.templates[gid]; delete data.collections[gid]; delete data.cards[gid]; delete data.fonts[gid];
        return ok({});
      }
    }

    // Templates
    if ((m = url.match(/^\/api\/games\/([^/]+)\/templates$/))) {
      const gid = m[1];
      if (method === "GET") return ok(Object.values(data.templates[gid] || {}));
      if (method === "POST") {
        const b = json(); const tpl = { ...defaultTemplate(), id: slug(b.name) || uid(), name: b.name };
        if (!data.templates[gid]) data.templates[gid] = {};
        data.templates[gid][tpl.id] = tpl;
        return created(tpl);
      }
    }
    if ((m = url.match(/^\/api\/games\/([^/]+)\/templates\/([^/]+)$/))) {
      const [, gid, tid] = m;
      if (method === "GET") return data.templates[gid]?.[tid] ? ok(data.templates[gid][tid]) : notFound();
      if (method === "PUT") {
        const b = json();
        if (!data.templates[gid]) data.templates[gid] = {};
        data.templates[gid][tid] = { ...b, id: tid };
        return ok(data.templates[gid][tid]);
      }
      if (method === "DELETE") {
        delete data.templates[gid]?.[tid];
        return ok({});
      }
    }
    if ((m = url.match(/^\/api\/games\/([^/]+)\/templates\/([^/]+)\/copy$/)) && method === "POST") {
      const [, gid, tid] = m;
      const orig = data.templates[gid]?.[tid];
      if (!orig) return notFound();
      const copy = { ...orig, id: `${tid}-copy-${uid()}`, name: `${orig.name} (Copy)` };
      data.templates[gid][copy.id] = copy;
      return created(copy);
    }

    // Collections
    if ((m = url.match(/^\/api\/games\/([^/]+)\/collections$/))) {
      const gid = m[1];
      if (method === "GET") return ok(Object.values(data.collections[gid] || {}));
      if (method === "POST") {
        const b = json(); const id = slug(b.name) || uid();
        const col = { id, name: b.name, templateId: b.templateId };
        if (!data.collections[gid]) data.collections[gid] = {};
        data.collections[gid][id] = col;
        if (!data.cards[gid]) data.cards[gid] = {};
        data.cards[gid][id] = {};
        return created(col);
      }
    }
    if ((m = url.match(/^\/api\/games\/([^/]+)\/collections\/([^/]+)$/))) {
      const [, gid, cid] = m;
      if (method === "GET") return data.collections[gid]?.[cid] ? ok(data.collections[gid][cid]) : notFound();
      if (method === "PUT") {
        if (!data.collections[gid]?.[cid]) return notFound();
        Object.assign(data.collections[gid][cid], json());
        return ok(data.collections[gid][cid]);
      }
      if (method === "DELETE") {
        delete data.collections[gid]?.[cid];
        delete data.cards[gid]?.[cid];
        return ok({});
      }
    }

    // Cards
    if ((m = url.match(/^\/api\/games\/([^/]+)\/collections\/([^/]+)\/cards$/))) {
      const [, gid, cid] = m;
      if (method === "GET") return ok(Object.values(data.cards[gid]?.[cid] || {}));
      if (method === "POST") {
        const b = json(); const card = { id: b.id || uid(), name: b.name || "Card", fields: b.fields || {} };
        if (!data.cards[gid]) data.cards[gid] = {};
        if (!data.cards[gid][cid]) data.cards[gid][cid] = {};
        data.cards[gid][cid][card.id] = card;
        return created(card);
      }
    }
    if ((m = url.match(/^\/api\/games\/([^/]+)\/collections\/([^/]+)\/cards\/([^/]+)$/))) {
      const [, gid, cid, kid] = m;
      if (method === "GET") return data.cards[gid]?.[cid]?.[kid] ? ok(data.cards[gid][cid][kid]) : notFound();
      if (method === "PUT") {
        const b = json();
        if (!data.cards[gid]?.[cid]) return notFound();
        data.cards[gid][cid][kid] = { ...b, id: kid };
        return ok(data.cards[gid][cid][kid]);
      }
      if (method === "DELETE") {
        delete data.cards[gid]?.[cid]?.[kid];
        return ok({});
      }
    }
    if ((m = url.match(/^\/api\/games\/([^/]+)\/collections\/([^/]+)\/cards\/([^/]+)\/copy$/)) && method === "POST") {
      const [, gid, cid, kid] = m;
      const orig = data.cards[gid]?.[cid]?.[kid];
      if (!orig) return notFound();
      const copy = { ...orig, id: uid(), name: `${orig.name} (Copy)` };
      data.cards[gid][cid][copy.id] = copy;
      return created(copy);
    }

    // Fonts (per-game)
    if ((m = url.match(/^\/api\/games\/([^/]+)\/fonts$/)) && method === "GET") {
      return ok(data.fonts[m[1]] || {});
    }
    if ((m = url.match(/^\/api\/games\/([^/]+)\/fonts\/upload$/)) && method === "POST") {
      const gid = m[1];
      if (!data.fonts[gid]) data.fonts[gid] = {};
      const slotName = opts.headers?.["X-Slot-Name"] || "font-" + uid();
      const fileName = uid() + ".woff2";
      data.fonts[gid][slotName] = { name: slotName, file: fileName, source: "upload" };
      return ok({ fonts: data.fonts[gid] });
    }
    if ((m = url.match(/^\/api\/games\/([^/]+)\/fonts\/google$/)) && method === "POST") {
      const gid = m[1]; const b = json();
      if (!data.fonts[gid]) data.fonts[gid] = {};
      const slot = b.slotName || slug(b.name);
      data.fonts[gid][slot] = { name: b.name, file: uid() + ".woff2", source: "google" };
      return ok({ fonts: data.fonts[gid] });
    }
    if ((m = url.match(/^\/api\/games\/([^/]+)\/fonts\/([^/]+)$/)) && method === "DELETE") {
      const [, gid, file] = m;
      const fonts = data.fonts[gid] || {};
      for (const [k, v] of Object.entries(fonts)) { if (v.file === file) delete fonts[k]; }
      return ok({ fonts });
    }

    // Font file GET (for export)
    if ((m = url.match(/^\/api\/games\/([^/]+)\/fonts\/([^/]+)$/)) && method === "GET") {
      const [, gid, file] = m;
      const fonts = data.fonts[gid] || {};
      const found = Object.values(fonts).find((f) => f.file === file);
      if (!found) return notFound();
      // Return a fake blob response
      const fakeBlob = Buffer.from("fake-font-data");
      return { ok: true, blob: async () => fakeBlob, status: 200 };
    }

    // Images
    if ((m = url.match(/^\/api\/games\/([^/]+)\/images\/upload$/)) && method === "POST") {
      const gid = m[1];
      const fileName = uid() + ".png";
      if (!data.images) data.images = {};
      if (!data.images[gid]) data.images[gid] = {};
      data.images[gid][fileName] = true;
      return created({ file: fileName, url: `/api/games/${gid}/images/${fileName}` });
    }
    // Image file GET (for export)
    if ((m = url.match(/^\/api\/games\/([^/]+)\/images\/([^/]+)$/)) && method === "GET") {
      const [, gid, file] = m;
      if (data.images?.[gid]?.[file]) {
        const fakeBlob = Buffer.from("fake-image-data");
        return { ok: true, blob: async () => fakeBlob, status: 200 };
      }
      return notFound();
    }

    return { ok: false, status: 404, json: async () => ({ error: "Not found" }) };
  });
}

// ── Run suite against localFile backend ───────────────────────────────────

describe("localFile backend", () => {
  let originalFetch;

  before(() => {
    originalFetch = globalThis.fetch;
    globalThis.fetch = createMockFetchForLocalFile();
  });

  after(() => {
    globalThis.fetch = originalFetch;
  });

  backendCompatSuite("localFile", async () => {
    return createLocalFileStorage({ defaultTemplate });
  });
});

// ── Round-trip test: export from one backend, import to another ───────────

describe("round-trip export/import", () => {
  let originalFetch;

  before(() => {
    originalFetch = globalThis.fetch;
    globalThis.fetch = createMockFetchForLocalFile();
  });

  after(() => {
    globalThis.fetch = originalFetch;
  });

  it("preserves all game data through zip export and import", async () => {
    const srcStorage = createLocalFileStorage({ defaultTemplate });

    // Create a game
    const game = await srcStorage.createGame("Round Trip Test");
    const gameId = game.id;

    // Upload fonts
    const fontData = await srcStorage.addGoogleFont(gameId, "Roboto", "title");
    const titleFontFile = fontData.fonts.title?.file ?? fontData.fonts.roboto?.file;

    // Upload an image
    const fakeImageFile = new File(["fake-png-data"], "hero.png", { type: "image/png" });
    const imageUrl = await srcStorage.uploadImage(gameId, fakeImageFile);

    // Build a template with all item types
    const templates = await srcStorage.listTemplates(gameId);
    const tpl = templates[0];
    tpl.name = "Full Template";
    tpl.width = 800;
    tpl.height = 1200;
    tpl.radius = 16;
    tpl.bleed = 10;
    tpl.root = {
      id: "root", name: "Root", layout: "column", sizePct: 100, gap: 12, columns: 2, children: [
        {
          id: "header", name: "Header", layout: "row", sizePct: 30, gap: 8, columns: 2, children: [], items: [
            { id: "title-item", name: "Title", type: "text", fieldId: "name", defaultValue: "Untitled",
              values: ["Warrior", "Mage", "Rogue"],
              fontSize: 32, align: "center", verticalAlign: "middle", font: "title", color: "#1a1a2e",
              anchor: { x: 0.5, y: 0.5 }, attach: { targetType: "section", targetId: "header", anchor: { x: 0.5, y: 0.5 } },
              widthPct: 100, heightPct: 100 },
            { id: "cost-item", name: "Cost", type: "text", fieldId: "cost", defaultValue: "0",
              fontSize: 20, align: "right", verticalAlign: "top", font: "title", color: "#e94560",
              anchor: { x: 1, y: 0 }, attach: { targetType: "item", targetId: "title-item", anchor: { x: 1, y: 0 } },
              widthPct: 20, heightPct: 30 },
          ],
        },
        {
          id: "body", name: "Body", layout: "stack", sizePct: 70, gap: 0, columns: 2, children: [
            {
              id: "art-section", name: "Art Section", layout: "grid", sizePct: 60, gap: 4, columns: 3, children: [], items: [
                { id: "art-item", name: "Artwork", type: "image", fieldId: "image", defaultValue: imageUrl,
                  fit: "cover", cornerRadius: 12,
                  anchor: { x: 0.5, y: 0 }, attach: { targetType: "section", targetId: "art-section", anchor: { x: 0.5, y: 0 } },
                  widthPct: 100, heightPct: 80 },
              ],
            },
          ],
          items: [
            { id: "border-item", name: "Border", type: "frame",
              strokeWidth: 3, strokeColor: "#16213e", fillColor: "none", cornerRadius: 8,
              anchor: { x: 0.5, y: 0.5 }, attach: { targetType: "section", targetId: "body", anchor: { x: 0.5, y: 0.5 } },
              widthPct: 95, heightPct: 95 },
            { id: "emoji-item", name: "Faction", type: "emoji", fieldId: "faction", emoji: "⚔️",
              values: ["⚔️", "🛡️", "🔮", "🏹"], fontSize: 48,
              anchor: { x: 0.5, y: 1 }, attach: { targetType: "section", targetId: "body", anchor: { x: 0.5, y: 1 } },
              widthPct: 15, heightPct: 10 },
            { id: "desc-item", name: "Description", type: "text", fieldId: "description", defaultValue: "",
              fontSize: 14, align: "left", verticalAlign: "top", color: "#333",
              anchor: { x: 0, y: 0 }, attach: { targetType: "item", targetId: "art-item", anchor: { x: 0, y: 1 } },
              widthPct: 90, heightPct: 30 },
          ],
        },
      ],
      items: [],
    };
    await srcStorage.saveTemplate(gameId, tpl.id, tpl);

    // Get the default collection and add cards
    const collections = await srcStorage.listCollections(gameId);
    const colId = collections[0].id;

    await srcStorage.saveCard(gameId, colId, "card-1", {
      id: "card-1", name: "Warrior",
      fields: { cost: "5", description: "<b>Brave</b> hero", image: imageUrl, faction: "⚔️" },
    });
    await srcStorage.saveCard(gameId, colId, "card-2", {
      id: "card-2", name: "Mage",
      fields: { cost: "3", description: "*Wise* mage", faction: "🔮" },
    });

    // Create second collection
    const col2 = await srcStorage.createCollection(gameId, "Expansion", tpl.id);
    await srcStorage.saveCard(gameId, col2.id, "card-3", {
      id: "card-3", name: "Rogue",
      fields: { cost: "4", faction: "🏹" },
    });

    // ── Export ──────────────────────────────────────────────────────────
    const zipBlob = await exportGameZip(srcStorage, gameId);
    assert.ok(zipBlob.size > 0, "zip should not be empty");
    const zipBuffer = await zipBlob.arrayBuffer();

    // ── Import ─────────────────────────────────────────────────────────
    const dstStorage = createLocalFileStorage({ defaultTemplate });
    const newGameId = await importGameZip(dstStorage, zipBuffer);
    assert.ok(newGameId, "import should return a game id");

    // ── Verify game metadata ───────────────────────────────────────────
    const imp = await dstStorage.getGame(newGameId);
    assert.equal(imp.name, "Round Trip Test");

    // ── Verify template structure ──────────────────────────────────────
    const impTemplates = await dstStorage.listTemplates(newGameId);
    assert.equal(impTemplates.length, 1);
    const impTpl = impTemplates[0];
    assert.equal(impTpl.name, "Full Template");
    assert.equal(impTpl.width, 800);
    assert.equal(impTpl.height, 1200);
    assert.equal(impTpl.radius, 16);
    assert.equal(impTpl.bleed, 10);

    // Root section
    assert.equal(impTpl.root.layout, "column");
    assert.equal(impTpl.root.gap, 12);
    assert.equal(impTpl.root.children.length, 2);

    // Header section
    const header = impTpl.root.children[0];
    assert.equal(header.name, "Header");
    assert.equal(header.layout, "row");
    assert.equal(header.items.length, 2);

    // Text item with all fields
    const titleItem = header.items.find((i) => i.id === "title-item");
    assert.ok(titleItem);
    assert.equal(titleItem.type, "text");
    assert.equal(titleItem.fieldId, "name");
    assert.equal(titleItem.defaultValue, "Untitled");
    assert.deepEqual(titleItem.values, ["Warrior", "Mage", "Rogue"]);
    assert.equal(titleItem.fontSize, 32);
    assert.equal(titleItem.align, "center");
    assert.equal(titleItem.verticalAlign, "middle");
    assert.equal(titleItem.font, "title");
    assert.equal(titleItem.color, "#1a1a2e");
    assert.deepEqual(titleItem.anchor, { x: 0.5, y: 0.5 });
    assert.equal(titleItem.attach.targetType, "section");
    assert.equal(titleItem.attach.targetId, "header");

    // Cost item with attach to another item
    const costItem = header.items.find((i) => i.id === "cost-item");
    assert.ok(costItem);
    assert.equal(costItem.attach.targetType, "item");
    assert.equal(costItem.attach.targetId, "title-item");

    // Body section
    const body = impTpl.root.children[1];
    assert.equal(body.layout, "stack");
    assert.equal(body.children.length, 1);
    assert.equal(body.items.length, 3);

    // Grid sub-section
    const artSection = body.children[0];
    assert.equal(artSection.layout, "grid");
    assert.equal(artSection.columns, 3);

    // Image item
    const artItem = artSection.items.find((i) => i.id === "art-item");
    assert.ok(artItem);
    assert.equal(artItem.type, "image");
    assert.equal(artItem.fit, "cover");
    assert.equal(artItem.cornerRadius, 12);
    // Image URL should be rewritten to new game ID
    assert.ok(artItem.defaultValue.includes(`/api/games/${newGameId}/images/`), "image URL should reference new game");

    // Frame item
    const borderItem = body.items.find((i) => i.id === "border-item");
    assert.ok(borderItem);
    assert.equal(borderItem.type, "frame");
    assert.equal(borderItem.strokeWidth, 3);
    assert.equal(borderItem.strokeColor, "#16213e");
    assert.equal(borderItem.fillColor, "none");
    assert.equal(borderItem.cornerRadius, 8);

    // Emoji item
    const emojiItem = body.items.find((i) => i.id === "emoji-item");
    assert.ok(emojiItem);
    assert.equal(emojiItem.type, "emoji");
    assert.equal(emojiItem.fieldId, "faction");
    assert.equal(emojiItem.emoji, "⚔️");
    assert.deepEqual(emojiItem.values, ["⚔️", "🛡️", "🔮", "🏹"]);
    assert.equal(emojiItem.fontSize, 48);

    // Description item attached to another item
    const descItem = body.items.find((i) => i.id === "desc-item");
    assert.ok(descItem);
    assert.equal(descItem.attach.targetType, "item");
    assert.equal(descItem.attach.targetId, "art-item");

    // ── Verify collections ─────────────────────────────────────────────
    const impCols = await dstStorage.listCollections(newGameId);
    assert.equal(impCols.length, 2);
    const colNames = impCols.map((c) => c.name).sort();
    assert.deepEqual(colNames, ["Default", "Expansion"]);
    for (const col of impCols) {
      assert.equal(col.templateId, tpl.id);
    }

    // ── Verify cards ───────────────────────────────────────────────────
    const defCol = impCols.find((c) => c.name === "Default");
    const defCards = await dstStorage.listCards(newGameId, defCol.id);
    assert.equal(defCards.length, 2);

    const warrior = defCards.find((c) => c.name === "Warrior");
    assert.ok(warrior);
    assert.equal(warrior.fields.cost, "5");
    assert.equal(warrior.fields.description, "<b>Brave</b> hero");
    assert.equal(warrior.fields.faction, "⚔️");
    // Image URL should be rewritten
    assert.ok(warrior.fields.image.includes(`/api/games/${newGameId}/images/`));

    const mage = defCards.find((c) => c.name === "Mage");
    assert.ok(mage);
    assert.equal(mage.fields.cost, "3");
    assert.equal(mage.fields.faction, "🔮");

    const expCol = impCols.find((c) => c.name === "Expansion");
    const expCards = await dstStorage.listCards(newGameId, expCol.id);
    assert.equal(expCards.length, 1);
    assert.equal(expCards[0].name, "Rogue");
    assert.equal(expCards[0].fields.faction, "🏹");

    // ── Verify fonts ───────────────────────────────────────────────────
    const impFonts = await dstStorage.listFonts(newGameId);
    assert.ok(typeof impFonts === "object" && !Array.isArray(impFonts));
    const fontSlots = Object.keys(impFonts);
    assert.ok(fontSlots.length >= 1, "should have at least 1 font slot");
  });

  it("preserves card field data with special characters", async () => {
    const srcStorage = createLocalFileStorage({ defaultTemplate });
    const game = await srcStorage.createGame("Special Chars");
    const cols = await srcStorage.listCollections(game.id);

    await srcStorage.saveCard(game.id, cols[0].id, "card-special", {
      id: "card-special",
      name: 'Card with "quotes" & <tags>',
      fields: { text: "Line 1\nLine 2", emoji: "⚔️🛡️", html: "<b>Bold</b>" },
    });

    const zipBlob = await exportGameZip(srcStorage, game.id);
    const zipBuffer = await zipBlob.arrayBuffer();
    const dstStorage = createLocalFileStorage({ defaultTemplate });
    const newId = await importGameZip(dstStorage, zipBuffer);

    const newCols = await dstStorage.listCollections(newId);
    const cards = await dstStorage.listCards(newId, newCols[0].id);
    const card = cards.find((c) => c.id === "card-special");
    assert.ok(card, "card should exist after import");
    assert.equal(card.name, 'Card with "quotes" & <tags>');
    assert.equal(card.fields.emoji, "⚔️🛡️");
    assert.equal(card.fields.text, "Line 1\nLine 2");
    assert.equal(card.fields.html, "<b>Bold</b>");
  });
});
