import assert from "node:assert/strict";
import { test } from "node:test";
import "fake-indexeddb/auto";

// Regression tests for save/cache behavior of the LIVE storage backends
// (src/storage/*, used by the app — not the legacy src/web copies):
//  - Google Drive listing caches must be invalidated on deletes, otherwise
//    deleted cards/layouts/collections resurface (or break list queries) for
//    up to 5 minutes.
//  - Google Drive must implement the image API like the other backends.
//  - Every backend must expose clearCache() so "reload from storage" can
//    bypass backend-internal caches.

// ── In-memory Google Drive mock ────────────────────────────────────────────

const createDriveMock = () => {
  const mockLocalStorage = new Map();
  global.localStorage = {
    getItem: (key) => mockLocalStorage.get(key) ?? null,
    setItem: (key, value) => mockLocalStorage.set(key, String(value)),
    removeItem: (key) => mockLocalStorage.delete(key),
  };

  global.document = {
    createElement: () => ({ src: "", async: false, defer: false, onload: null, onerror: null }),
    head: { appendChild: (script) => { if (script.onload) setTimeout(script.onload, 0); } },
  };

  const mockTokenClient = {
    callback: null,
    requestAccessToken: () => {
      if (mockTokenClient.callback) {
        setTimeout(() => {
          mockTokenClient.callback({ access_token: "mock_access_token", expires_in: 3600 });
        }, 0);
      }
    },
  };

  global.window = {
    google: {
      accounts: {
        oauth2: {
          initTokenClient: ({ callback }) => {
            mockTokenClient.callback = callback;
            return mockTokenClient;
          },
          revoke: (_token, callback) => { if (callback) callback(); },
        },
      },
    },
    location: { hostname: "example.com" },
  };

  // The fake Drive: id → { id, name, mimeType, appProperties, parents, content|binary }
  const files = new Map();
  let seq = 0;
  const nid = (prefix) => `${prefix}_${++seq}`;

  const parseQuery = (q) => {
    const parent = q.match(/'([^']+)' in parents/)?.[1];
    const mimeEq = q.match(/mimeType='([^']+)'/)?.[1];
    const mimeNe = [...q.matchAll(/mimeType != '([^']+)'/g)].map((m) => m[1]);
    return { parent, mimeEq, mimeNe };
  };

  const listFiles = (q) => {
    const { parent, mimeEq, mimeNe } = parseQuery(q);
    return [...files.values()].filter((f) => {
      if (parent && !(f.parents ?? []).includes(parent)) return false;
      if (mimeEq && f.mimeType !== mimeEq) return false;
      if (mimeNe.includes(f.mimeType)) return false;
      return true;
    });
  };

  const fileSummary = (f) => ({
    id: f.id, name: f.name, mimeType: f.mimeType, appProperties: f.appProperties,
  });

  const parseMultipart = async (body, contentType) => {
    const boundary = contentType.match(/boundary=(.+)$/)?.[1];
    const text = typeof body === "string" ? body : await body.text();
    const parts = text
      .split(`--${boundary}`)
      .map((p) => p.replace(/^\r\n/, "").replace(/\r\n$/, ""))
      .filter((p) => p && p !== "--");
    const parsed = parts.map((part) => {
      const sep = part.indexOf("\r\n\r\n");
      const headers = part.slice(0, sep);
      const payload = part.slice(sep + 4);
      const mime = headers.match(/Content-Type:\s*([^;\r\n]+)/i)?.[1] ?? "application/octet-stream";
      return { mime, payload };
    });
    const meta = JSON.parse(parsed[0].payload);
    return { meta, content: parsed[1] };
  };

  global.fetch = async (url, options = {}) => {
    const method = options.method ?? "GET";
    const notFound = { ok: false, status: 404, text: async () => "Not found" };

    // Google Fonts endpoints used by addGoogleFont
    if (String(url).startsWith("https://fonts.googleapis.com/css2")) {
      return { ok: true, text: async () => "src: url(https://fonts.gstatic.com/fake.woff2) format('woff2')" };
    }
    if (String(url).startsWith("https://fonts.gstatic.com/")) {
      return { ok: true, arrayBuffer: async () => new TextEncoder().encode("WOFF2DATA").buffer };
    }

    // Create folder (or metadata-only file)
    if (url.includes("/drive/v3/files?fields=id") && method === "POST") {
      const meta = JSON.parse(options.body);
      const id = nid("folder");
      files.set(id, { id, ...meta, parents: meta.parents ?? [] });
      return { ok: true, json: async () => ({ id }) };
    }

    // List files
    if (url.includes("/drive/v3/files?q=")) {
      const q = decodeURIComponent(url.split("q=")[1].split("&")[0]);
      return { ok: true, json: async () => ({ files: listFiles(q).map(fileSummary) }) };
    }

    // Read content
    if (url.includes("alt=media") && method === "GET") {
      const id = url.split("/files/")[1].split("?")[0];
      const f = files.get(id);
      if (!f) return notFound;
      return {
        ok: true,
        json: async () => f.content,
        blob: async () => new Blob([f.binary ?? ""], { type: f.mimeType }),
      };
    }

    // Update content
    if (url.includes("uploadType=media") && method === "PATCH") {
      const id = url.split("/files/")[1].split("?")[0];
      const f = files.get(id);
      if (!f) return notFound;
      f.content = JSON.parse(options.body);
      return { ok: true, json: async () => ({}) };
    }

    // Update metadata (e.g. renameImage patches appProperties)
    if (url.match(/\/drive\/v3\/files\/[^/?]+$/) && method === "PATCH") {
      const id = url.split("/files/")[1];
      const f = files.get(id);
      if (!f) return notFound;
      const meta = JSON.parse(options.body);
      Object.assign(f, { ...meta, appProperties: { ...f.appProperties, ...meta.appProperties } });
      return { ok: true, json: async () => ({ id }) };
    }

    // Delete
    if (method === "DELETE") {
      const id = url.split("/files/")[1].split("?")[0];
      files.delete(id);
      return { ok: true, text: async () => "" };
    }

    // Multipart create (JSON or binary file)
    if (url.includes("uploadType=multipart") && method === "POST") {
      const contentType = options.headers?.["Content-Type"] ?? "";
      const { meta, content } = await parseMultipart(options.body, contentType);
      const id = nid("file");
      const record = { id, ...meta, parents: meta.parents ?? [] };
      if (content.mime === "application/json") record.content = JSON.parse(content.payload);
      else record.binary = content.payload;
      files.set(id, record);
      return { ok: true, json: async () => ({ id }) };
    }

    return notFound;
  };

  return { files };
};

const defaultLayout = () => ({
  version: 2,
  id: "default",
  name: "Default",
  width: 63.5,
  height: 88.9,
  radius: 2.5,
  bleed: 1.5,
  root: { id: "root", name: "Root", layout: "stack", sizePct: 100, gap: 0, children: [], items: [] },
});

const makeStorage = async () => {
  const { createGoogleDriveStorage } = await import("../src/storage/googleDrive.js");
  const storage = createGoogleDriveStorage({
    clientId: "test-client-id.apps.googleusercontent.com",
    appTag: "test-app",
    defaultLayout,
  });
  await storage.init();
  await storage.signIn();
  return storage;
};

// ── Listing-cache invalidation on delete ───────────────────────────────────

test("googleDrive: deleted card disappears from listCards immediately", async () => {
  createDriveMock();
  const storage = await makeStorage();
  const game = await storage.createGame("Cache Game");

  await storage.saveCard(game.id, "default", "card-a", { id: "card-a", name: "A", fields: {} });
  await storage.saveCard(game.id, "default", "card-b", { id: "card-b", name: "B", fields: {} });
  let cards = await storage.listCards(game.id, "default");
  assert.deepEqual(cards.map((c) => c.id).sort(), ["card-a", "card-b"]);

  await storage.deleteCard(game.id, "default", "card-a");
  // Without listing-cache invalidation this either throws (stale listing
  // points at a deleted file) or resurrects card-a for up to 5 minutes.
  cards = await storage.listCards(game.id, "default");
  assert.deepEqual(cards.map((c) => c.id), ["card-b"]);
});

test("googleDrive: deleted layout disappears from listLayouts immediately", async () => {
  createDriveMock();
  const storage = await makeStorage();
  const game = await storage.createGame("Cache Game");

  const extra = await storage.createLayout(game.id, "Extra Layout");
  let layouts = await storage.listLayouts(game.id);
  assert.equal(layouts.length, 2);

  await storage.deleteLayout(game.id, extra.id);
  layouts = await storage.listLayouts(game.id);
  assert.deepEqual(layouts.map((l) => l.id), ["default"]);
});

test("googleDrive: deleted collection disappears from listCollections immediately", async () => {
  createDriveMock();
  const storage = await makeStorage();
  const game = await storage.createGame("Cache Game");

  const extras = await storage.createCollection(game.id, "Extras", "default");
  let cols = await storage.listCollections(game.id);
  assert.deepEqual(cols.map((c) => c.id).sort(), ["default", extras.id].sort());

  await storage.deleteCollection(game.id, extras.id);
  cols = await storage.listCollections(game.id);
  assert.deepEqual(cols.map((c) => c.id), ["default"]);
});

// ── Image API parity with the other backends ───────────────────────────────

const fakeFile = (name, type, data) => ({
  name,
  type,
  arrayBuffer: async () => new TextEncoder().encode(data).buffer,
});

test("googleDrive: image upload/list/rename/delete round-trip", async () => {
  createDriveMock();
  const storage = await makeStorage();
  const game = await storage.createGame("Image Game");

  const url = await storage.uploadImage(game.id, fakeFile("hero.png", "image/png", "PNGDATA"));
  assert.equal(url, `/api/games/${game.id}/images/hero.png`);

  let images = await storage.listImages(game.id);
  assert.equal(images.length, 1);
  assert.equal(images[0].file, "hero.png");
  assert.equal(images[0].url, url);
  assert.equal(images[0].name, "hero");

  await storage.renameImage(game.id, "hero.png", "Hero Art");
  images = await storage.listImages(game.id);
  assert.equal(images[0].name, "Hero Art");
  assert.equal(images[0].url, url, "rename must not change the asset URL");

  await storage.deleteImage(game.id, "hero.png");
  images = await storage.listImages(game.id);
  assert.deepEqual(images, []);
});

// ── clearCache: the "reload from storage" path ─────────────────────────────

test("googleDrive: clearCache drops stale listings so reload sees remote changes", async () => {
  createDriveMock();
  const deviceA = await makeStorage();
  const deviceB = await makeStorage();

  const game = await deviceA.createGame("Sync Game");
  await deviceA.saveCard(game.id, "default", "card-a", { id: "card-a", name: "A", fields: {} });
  assert.equal((await deviceA.listCards(game.id, "default")).length, 1);

  // Another device adds a card; A's 5-minute listing cache hides it.
  await deviceB.saveCard(game.id, "default", "card-b", { id: "card-b", name: "B", fields: {} });
  assert.equal((await deviceA.listCards(game.id, "default")).length, 1,
    "listing cache still serves the old listing (documents the 5-min TTL)");

  deviceA.clearCache();
  assert.equal((await deviceA.listCards(game.id, "default")).length, 2,
    "after clearCache the reload must see the remote change");
});

test("googleDrive: clearCache drops stale content so reload sees remote edits", async () => {
  createDriveMock();
  const deviceA = await makeStorage();
  const deviceB = await makeStorage();

  const game = await deviceA.createGame("Sync Game");
  await deviceA.saveCard(game.id, "default", "c1", { id: "c1", name: "Old", fields: {} });
  assert.equal((await deviceA.getCard(game.id, "default", "c1")).name, "Old");

  await deviceB.listCards(game.id, "default"); // warm B's file-id cache
  await deviceB.saveCard(game.id, "default", "c1", { id: "c1", name: "New", fields: {} });
  assert.equal((await deviceA.getCard(game.id, "default", "c1")).name, "Old",
    "content cache still serves the old card (documents the 5-min TTL)");

  deviceA.clearCache();
  assert.equal((await deviceA.getCard(game.id, "default", "c1")).name, "New");
});

// ── Backend consistency (parity with indexedDB/S3/localFile) ───────────────

test("googleDrive: same-named collections get distinct ids and card sets", async () => {
  createDriveMock();
  const storage = await makeStorage();
  const game = await storage.createGame("Dup Game");

  const a = await storage.createCollection(game.id, "Heroes", "default");
  const b = await storage.createCollection(game.id, "Heroes", "default");
  assert.notEqual(a.id, b.id, "duplicate names must not collide");

  await storage.saveCard(game.id, a.id, "card-a", { id: "card-a", name: "A", fields: {} });
  await storage.saveCard(game.id, b.id, "card-b", { id: "card-b", name: "B", fields: {} });
  assert.deepEqual((await storage.listCards(game.id, a.id)).map(c => c.id), ["card-a"], "cards must not merge");
  assert.deepEqual((await storage.listCards(game.id, b.id)).map(c => c.id), ["card-b"]);

  const layoutA = await storage.createLayout(game.id, "Fancy");
  const layoutB = await storage.createLayout(game.id, "Fancy");
  assert.notEqual(layoutA.id, layoutB.id, "duplicate layout names must not collide");
});

test("googleDrive: deleteCard works with a cold id cache", async () => {
  const { files } = createDriveMock();
  const deviceA = await makeStorage();
  const game = await deviceA.createGame("Cold Game");
  await deviceA.saveCard(game.id, "default", "c1", { id: "c1", name: "C", fields: {} });

  // Fresh instance: no fileIds warmed by a prior list.
  const deviceB = await makeStorage();
  await deviceB.deleteCard(game.id, "default", "c1");
  const remaining = [...files.values()].filter(f => f.name === "c1.json");
  assert.equal(remaining.length, 0, "delete must resolve the file id via Drive, not silently no-op");
});

test("googleDrive: deleteLayout refuses when a collection uses it", async () => {
  createDriveMock();
  const storage = await makeStorage();
  const game = await storage.createGame("Guard Game");

  await assert.rejects(
    () => storage.deleteLayout(game.id, "default"),
    /in use/,
    "deleting the default collection's layout must fail like on localFile/indexedDB"
  );

  const extra = await storage.createLayout(game.id, "Unused");
  await storage.deleteLayout(game.id, extra.id);
  assert.deepEqual((await storage.listLayouts(game.id)).map(l => l.id), ["default"]);
});

test("googleDrive: addGoogleFont downloads the binary; deleteFont removes it", async () => {
  const { files } = createDriveMock();
  const storage = await makeStorage();
  const game = await storage.createGame("Font Game");

  const { fonts } = await storage.addGoogleFont(game.id, "Space Grotesk");
  const entry = Object.values(fonts).find(f => f.name === "Space Grotesk");
  assert.ok(entry?.file, "manifest entry must reference a real file (was file:'' — font never rendered)");
  assert.ok([...files.values()].some(f => f.name === entry.file), "woff2 binary must be uploaded to Drive");

  await storage.deleteFont(game.id, entry.file);
  assert.ok(![...files.values()].some(f => f.name === entry.file), "binary must be deleted from Drive, not leaked");
});

// ── clearCache exists on every backend ─────────────────────────────────────

test("all backends expose clearCache for reload-from-storage", async () => {
  createDriveMock();
  const { createGoogleDriveStorage } = await import("../src/storage/googleDrive.js");
  const { createLocalFileStorage } = await import("../src/storage/localFile.js");
  const { createIndexedDBStorage } = await import("../src/storage/indexedDB.js");
  const { createS3Storage } = await import("../src/storage/s3.js");

  const backends = {
    googleDrive: createGoogleDriveStorage({ clientId: "x.y", defaultLayout }),
    localFile: createLocalFileStorage({ defaultLayout }),
    indexedDB: createIndexedDBStorage({ defaultLayout }),
    s3: createS3Storage({ defaultLayout, bucket: "b", accessKeyId: "k", secretAccessKey: "s" }),
  };
  for (const [name, backend] of Object.entries(backends)) {
    assert.equal(typeof backend.clearCache, "function", `${name} must expose clearCache()`);
  }
});
