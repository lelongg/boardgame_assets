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
      const fakeBlob = new Blob(["fake-font-data"], { type: "font/woff2" });
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
        const fakeBlob = new Blob(["fake-image-data"], { type: "image/png" });
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

    // Create a game with data
    const game = await srcStorage.createGame("Round Trip Test");
    const gameId = game.id;

    // Get the default template and modify it
    const templates = await srcStorage.listTemplates(gameId);
    const tpl = templates[0];
    tpl.name = "Custom Template";
    tpl.width = 800;
    tpl.height = 1200;
    await srcStorage.saveTemplate(gameId, tpl.id, tpl);

    // Get the default collection
    const collections = await srcStorage.listCollections(gameId);
    const colId = collections[0].id;

    // Add cards with field data
    await srcStorage.saveCard(gameId, colId, "card-1", {
      id: "card-1", name: "Hero", fields: { cost: "5", description: "A brave hero" },
    });
    await srcStorage.saveCard(gameId, colId, "card-2", {
      id: "card-2", name: "Villain", fields: { cost: "7", description: "An evil villain" },
    });

    // Create a second collection
    const col2 = await srcStorage.createCollection(gameId, "Expansion", tpl.id);
    await srcStorage.saveCard(gameId, col2.id, "card-3", {
      id: "card-3", name: "Sidekick", fields: { cost: "2" },
    });

    // Export
    const zipBlob = await exportGameZip(srcStorage, gameId);
    assert.ok(zipBlob.size > 0, "zip should not be empty");
    // Convert Blob to ArrayBuffer for Node.js compatibility with JSZip
    const zipBuffer = await zipBlob.arrayBuffer();

    // Import into a fresh backend (same mock, but creates a new game)
    const dstStorage = createLocalFileStorage({ defaultTemplate });
    const newGameId = await importGameZip(dstStorage, zipBuffer);
    assert.ok(newGameId, "import should return a game id");

    // Verify game metadata
    const importedGame = await dstStorage.getGame(newGameId);
    assert.equal(importedGame.name, "Round Trip Test");

    // Verify templates
    const importedTemplates = await dstStorage.listTemplates(newGameId);
    assert.equal(importedTemplates.length, 1, "should have 1 template");
    assert.equal(importedTemplates[0].name, "Custom Template");
    assert.equal(importedTemplates[0].width, 800);
    assert.equal(importedTemplates[0].height, 1200);
    assert.ok(importedTemplates[0].root, "template should have root section");
    assert.ok(importedTemplates[0].fonts, "template should have fonts");

    // Verify collections
    const importedCollections = await dstStorage.listCollections(newGameId);
    assert.equal(importedCollections.length, 2, "should have 2 collections");
    const colNames = importedCollections.map((c) => c.name).sort();
    assert.deepEqual(colNames, ["Default", "Expansion"]);

    // All collections should reference the template
    for (const col of importedCollections) {
      assert.equal(col.templateId, tpl.id, `collection ${col.name} should reference template`);
    }

    // Verify cards in first collection
    const defaultCol = importedCollections.find((c) => c.name === "Default");
    const defaultCards = await dstStorage.listCards(newGameId, defaultCol.id);
    assert.equal(defaultCards.length, 2, "Default collection should have 2 cards");
    const hero = defaultCards.find((c) => c.name === "Hero");
    assert.ok(hero, "Hero card should exist");
    assert.equal(hero.fields.cost, "5");
    assert.equal(hero.fields.description, "A brave hero");
    const villain = defaultCards.find((c) => c.name === "Villain");
    assert.ok(villain, "Villain card should exist");
    assert.equal(villain.fields.cost, "7");

    // Verify cards in second collection
    const expCol = importedCollections.find((c) => c.name === "Expansion");
    const expCards = await dstStorage.listCards(newGameId, expCol.id);
    assert.equal(expCards.length, 1, "Expansion collection should have 1 card");
    assert.equal(expCards[0].name, "Sidekick");
    assert.equal(expCards[0].fields.cost, "2");

    // Verify fonts
    const importedFonts = await dstStorage.listFonts(newGameId);
    assert.ok(typeof importedFonts === "object" && !Array.isArray(importedFonts), "fonts should be an object");
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
