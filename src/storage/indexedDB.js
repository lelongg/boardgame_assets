/**
 * IndexedDB browser storage backend.
 * Stores all data locally for offline/serverless use.
 */

import { putAsset, deleteAsset, listAssets } from "./assetCache.js";
import { normalizeCard, normalizeLayout } from "../normalizeExport.js";

// ── Utilities ──────────────────────────────────────────────────────────────

const slugify = (v) =>
  v.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

const now = () => new Date().toISOString();

const uid = () => Math.random().toString(36).slice(2, 10);

const hashArrayBuffer = async (buf) => {
  const hash = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 12);
};

// ── Database ───────────────────────────────────────────────────────────────

const DB_NAME = "boardgame-assets";
const DB_VERSION = 3;

function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;

      // Create all stores first (order matters for migration below)
      if (!db.objectStoreNames.contains("games")) {
        db.createObjectStore("games");
      }
      if (!db.objectStoreNames.contains("layouts")) {
        db.createObjectStore("layouts");
      }
      if (!db.objectStoreNames.contains("collections")) {
        db.createObjectStore("collections");
      }
      if (!db.objectStoreNames.contains("cards")) {
        db.createObjectStore("cards");
      }
      if (!db.objectStoreNames.contains("assets")) {
        db.createObjectStore("assets");
      }

      // Migrate v2 "templates" → "layouts" and rename templateId in collections
      if (db.objectStoreNames.contains("templates")) {
        const tx = event.target.transaction;
        const oldStore = tx.objectStore("templates");
        const newStore = tx.objectStore("layouts");
        const colStore = tx.objectStore("collections");

        // Copy templates to layouts
        const cursorReq = oldStore.openCursor();
        cursorReq.onsuccess = (e) => {
          const cursor = e.target.result;
          if (cursor) {
            newStore.put(cursor.value, cursor.key);
            cursor.continue();
          } else {
            // Cursor done — safe to delete the old store
            db.deleteObjectStore("templates");
          }
        };

        // Rename templateId → layoutId in existing collections
        const colCursor = colStore.openCursor();
        colCursor.onsuccess = (e) => {
          const cursor = e.target.result;
          if (cursor) {
            const val = cursor.value;
            if (val.templateId && !val.layoutId) {
              val.layoutId = val.templateId;
              delete val.templateId;
              cursor.update(val);
            }
            cursor.continue();
          }
        };
      }
    };

    request.onsuccess = (event) => resolve(event.target.result);
    request.onerror = (event) => reject(event.target.error);
  });
}

// ── Low-level IDB helpers ──────────────────────────────────────────────────

function idbGet(db, storeName, key) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readonly");
    const req = tx.objectStore(storeName).get(key);
    req.onsuccess = (e) => resolve(e.target.result);
    req.onerror = (e) => reject(e.target.error);
  });
}

function idbPut(db, storeName, key, value) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readwrite");
    const req = tx.objectStore(storeName).put(value, key);
    req.onsuccess = () => resolve();
    req.onerror = (e) => reject(e.target.error);
  });
}

function idbDelete(db, storeName, key) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readwrite");
    const req = tx.objectStore(storeName).delete(key);
    req.onsuccess = () => resolve();
    req.onerror = (e) => reject(e.target.error);
  });
}

/**
 * Get all keys (and optionally values) in a store whose compound key starts
 * with the given prefix components.
 * e.g. prefix = [gameId] fetches all [gameId, *] keys.
 */
function idbGetAllByPrefix(db, storeName, prefix) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readonly");
    const store = tx.objectStore(storeName);
    // Build a range from [gameId] to [gameId, '\uffff', '\uffff', ...]
    const lower = prefix;
    const upper = [...prefix, "\uffff"];
    const range = IDBKeyRange.bound(lower, upper);
    const results = [];
    const req = store.openCursor(range);
    req.onsuccess = (e) => {
      const cursor = e.target.result;
      if (cursor) {
        results.push({ key: cursor.key, value: cursor.value });
        cursor.continue();
      } else {
        resolve(results);
      }
    };
    req.onerror = (e) => reject(e.target.error);
  });
}

function idbDeleteByPrefix(db, storeName, prefix) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readwrite");
    const store = tx.objectStore(storeName);
    const lower = prefix;
    const upper = [...prefix, "\uffff"];
    const range = IDBKeyRange.bound(lower, upper);
    const req = store.openCursor(range);
    req.onsuccess = (e) => {
      const cursor = e.target.result;
      if (cursor) {
        cursor.delete();
        cursor.continue();
      } else {
        resolve();
      }
    };
    req.onerror = (e) => reject(e.target.error);
  });
}

// ── Font manifest helpers ──────────────────────────────────────────────────

const fontsKey = (gameId) => `${gameId}:fonts`;

async function getFontManifest(db, gameId) {
  return (await idbGet(db, "games", fontsKey(gameId))) ?? {};
}

async function saveFontManifest(db, gameId, manifest) {
  await idbPut(db, "games", fontsKey(gameId), manifest);
}

// ── Factory ────────────────────────────────────────────────────────────────

export const createIndexedDBStorage = ({ defaultLayout } = {}) => {
  return {
    // ── Lifecycle ──────────────────────────────────────────────────────────

    async init() {},
    async tryRestoreSession() { return true; },
    isAuthorized() { return true; },
    async signIn() {},
    async signOut() {},

    // ── Games ──────────────────────────────────────────────────────────────

    async listGames() {
      const db = await openDB();
      try {
        return new Promise((resolve, reject) => {
          const tx = db.transaction("games", "readonly");
          const store = tx.objectStore("games");
          // Only return entries whose key is a plain string (not "gameId:fonts")
          const results = [];
          const req = store.openCursor();
          req.onsuccess = (e) => {
            const cursor = e.target.result;
            if (cursor) {
              // Skip font manifests (keys like "gameId:fonts")
              if (typeof cursor.key === "string" && !cursor.key.includes(":")) {
                results.push(cursor.value);
              }
              cursor.continue();
            } else {
              // Sort by creation date
              results.sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
              resolve(results);
            }
          };
          req.onerror = (e) => reject(e.target.error);
        });
      } finally {
        db.close();
      }
    },

    async getGame(gameId) {
      const db = await openDB();
      try {
        const game = await idbGet(db, "games", gameId);
        if (!game) throw new Error(`Game not found: ${gameId}`);
        return game;
      } finally {
        db.close();
      }
    },

    async createGame(name) {
      const db = await openDB();
      try {
        const gameId = slugify(name) + "-" + uid();
        const game = {
          id: gameId,
          name,
          createdAt: now(),
          updatedAt: now(),
        };
        await idbPut(db, "games", gameId, game);

        // Create a default layout
        const layoutId = "default";
        const layout = normalizeLayout(
          defaultLayout ? defaultLayout() : { id: layoutId, name: "Default" }
        );
        layout.id = layoutId;
        await idbPut(db, "layouts", [gameId, layoutId], layout);

        // Create a default collection
        const collectionId = "default";
        const collection = {
          id: collectionId,
          name: "Default",
          layoutId,
          createdAt: now(),
        };
        await idbPut(db, "collections", [gameId, collectionId], collection);

        return game;
      } finally {
        db.close();
      }
    },

    async updateGame(gameId, updates) {
      const db = await openDB();
      try {
        const game = await idbGet(db, "games", gameId);
        if (!game) throw new Error(`Game not found: ${gameId}`);
        const updated = { ...game, ...updates, id: gameId, updatedAt: now() };
        await idbPut(db, "games", gameId, updated);
        return updated;
      } finally {
        db.close();
      }
    },

    async deleteGame(gameId) {
      const db = await openDB();
      try {
        // Delete game record and font manifest
        await idbDelete(db, "games", gameId);
        await idbDelete(db, "games", fontsKey(gameId));

        // Delete all layouts, collections, cards for this game
        await idbDeleteByPrefix(db, "layouts", [gameId]);
        await idbDeleteByPrefix(db, "collections", [gameId]);
        await idbDeleteByPrefix(db, "cards", [gameId]);

        // Delete all assets for this game
        const prefix = `/api/games/${gameId}/`;
        const assetKeys = await listAssets(prefix);
        for (const key of assetKeys) {
          await deleteAsset(key);
        }
      } finally {
        db.close();
      }
    },

    // ── Layouts ──────────────────────────────────────────────────────────

    async listLayouts(gameId) {
      const db = await openDB();
      try {
        const entries = await idbGetAllByPrefix(db, "layouts", [gameId]);
        return entries.map((e) => e.value);
      } finally {
        db.close();
      }
    },

    async getLayout(gameId, layoutId) {
      const db = await openDB();
      try {
        const layout = await idbGet(db, "layouts", [gameId, layoutId]);
        if (!layout) throw new Error(`Layout not found: ${layoutId}`);
        return layout;
      } finally {
        db.close();
      }
    },

    async saveLayout(gameId, layoutId, layout) {
      const db = await openDB();
      try {
        const normalized = normalizeLayout({ ...layout, id: layoutId });
        await idbPut(db, "layouts", [gameId, layoutId], normalized);
        return normalized;
      } finally {
        db.close();
      }
    },

    async createLayout(gameId, name) {
      const db = await openDB();
      try {
        const layoutId = slugify(name) + "-" + uid();
        const layout = normalizeLayout(
          defaultLayout
            ? { ...defaultLayout(), id: layoutId, name }
            : { id: layoutId, name }
        );
        await idbPut(db, "layouts", [gameId, layoutId], layout);
        return layout;
      } finally {
        db.close();
      }
    },

    async copyLayout(gameId, layoutId) {
      const db = await openDB();
      try {
        const source = await idbGet(db, "layouts", [gameId, layoutId]);
        if (!source) throw new Error(`Layout not found: ${layoutId}`);
        const newId = slugify(source.name) + "-" + uid();
        const copy = normalizeLayout({ ...source, id: newId, name: `${source.name} (copy)` });
        await idbPut(db, "layouts", [gameId, newId], copy);
        return copy;
      } finally {
        db.close();
      }
    },

    async deleteLayout(gameId, layoutId) {
      const db = await openDB();
      try {
        // Check if any collection uses this layout
        const collections = await idbGetAllByPrefix(db, "collections", [gameId]);
        const inUse = collections.some((e) => e.value.layoutId === layoutId);
        if (inUse) {
          throw new Error("Cannot delete layout that is in use by a collection");
        }
        await idbDelete(db, "layouts", [gameId, layoutId]);
      } finally {
        db.close();
      }
    },

    // ── Collections ────────────────────────────────────────────────────────

    async listCollections(gameId) {
      const db = await openDB();
      try {
        const entries = await idbGetAllByPrefix(db, "collections", [gameId]);
        return entries.map((e) => e.value);
      } finally {
        db.close();
      }
    },

    async getCollection(gameId, collectionId) {
      const db = await openDB();
      try {
        const col = await idbGet(db, "collections", [gameId, collectionId]);
        if (!col) throw new Error(`Collection not found: ${collectionId}`);
        return col;
      } finally {
        db.close();
      }
    },

    async createCollection(gameId, name, layoutId) {
      const db = await openDB();
      try {
        const collectionId = slugify(name) + "-" + uid();
        const collection = {
          id: collectionId,
          name,
          layoutId,
          createdAt: now(),
        };
        await idbPut(db, "collections", [gameId, collectionId], collection);
        return collection;
      } finally {
        db.close();
      }
    },

    async updateCollection(gameId, collectionId, updates) {
      const db = await openDB();
      try {
        const col = await idbGet(db, "collections", [gameId, collectionId]);
        if (!col) throw new Error(`Collection not found: ${collectionId}`);
        const updated = { ...col, ...updates, id: collectionId, updatedAt: now() };
        await idbPut(db, "collections", [gameId, collectionId], updated);
        return updated;
      } finally {
        db.close();
      }
    },

    async deleteCollection(gameId, collectionId) {
      const db = await openDB();
      try {
        await idbDelete(db, "collections", [gameId, collectionId]);
        // Delete all cards in this collection
        await idbDeleteByPrefix(db, "cards", [gameId, collectionId]);
      } finally {
        db.close();
      }
    },

    // ── Cards ──────────────────────────────────────────────────────────────

    async listCards(gameId, collectionId) {
      const db = await openDB();
      try {
        const entries = await idbGetAllByPrefix(db, "cards", [gameId, collectionId]);
        return entries.map((e) => e.value);
      } finally {
        db.close();
      }
    },

    async getCard(gameId, collectionId, cardId) {
      const db = await openDB();
      try {
        const card = await idbGet(db, "cards", [gameId, collectionId, cardId]);
        if (!card) throw new Error(`Card not found: ${cardId}`);
        return card;
      } finally {
        db.close();
      }
    },

    async saveCard(gameId, collectionId, cardId, card) {
      const db = await openDB();
      try {
        const id = cardId || uid();
        const normalized = normalizeCard({ ...card, id });
        await idbPut(db, "cards", [gameId, collectionId, id], normalized);
        return normalized;
      } finally {
        db.close();
      }
    },

    async copyCard(gameId, collectionId, cardId) {
      const db = await openDB();
      try {
        const source = await idbGet(db, "cards", [gameId, collectionId, cardId]);
        if (!source) throw new Error(`Card not found: ${cardId}`);
        const newId = uid();
        const copy = normalizeCard({ ...source, id: newId, name: `${source.name} (copy)` });
        await idbPut(db, "cards", [gameId, collectionId, newId], copy);
        return copy;
      } finally {
        db.close();
      }
    },

    async deleteCard(gameId, collectionId, cardId) {
      const db = await openDB();
      try {
        await idbDelete(db, "cards", [gameId, collectionId, cardId]);
      } finally {
        db.close();
      }
    },

    // ── Fonts ──────────────────────────────────────────────────────────────

    async listFonts(gameId) {
      const db = await openDB();
      try {
        return await getFontManifest(db, gameId);
      } finally {
        db.close();
      }
    },

    async addGoogleFont(gameId, name, slotName) {
      // Fetch the CSS from Google Fonts to get the woff2 URL
      const cssUrl = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(name)}`;
      const cssResp = await fetch(cssUrl);
      if (!cssResp.ok) throw new Error(`Failed to fetch Google Font CSS for "${name}"`);
      const css = await cssResp.text();

      // Extract the first woff2 URL
      const match = css.match(/url\((https:\/\/fonts\.gstatic\.com\/[^)]+\.woff2)\)/);
      if (!match) throw new Error(`No woff2 URL found in Google Font CSS for "${name}"`);
      const woff2Url = match[1];

      // Download the font binary
      const fontResp = await fetch(woff2Url);
      if (!fontResp.ok) throw new Error(`Failed to download font binary for "${name}"`);
      const buf = await fontResp.arrayBuffer();
      const hash = await hashArrayBuffer(buf);
      const fileName = `${hash}.woff2`;
      const assetPath = `/api/games/${gameId}/fonts/${fileName}`;

      await putAsset(assetPath, new Blob([buf], { type: "font/woff2" }), "font/woff2");

      const db = await openDB();
      try {
        const fonts = await getFontManifest(db, gameId);
        const slot = slotName || slugify(name);
        fonts[slot] = { name, file: fileName, source: "google" };
        await saveFontManifest(db, gameId, fonts);
        return { fonts };
      } finally {
        db.close();
      }
    },

    async uploadFont(gameId, file, slotName) {
      const buf = await file.arrayBuffer();
      const hash = await hashArrayBuffer(buf);
      const ext = file.name.includes(".") ? "." + file.name.split(".").pop() : "";
      const fileName = `${hash}${ext}`;
      const mimeType = file.type || "font/woff2";
      const assetPath = `/api/games/${gameId}/fonts/${fileName}`;

      await putAsset(assetPath, new Blob([buf], { type: mimeType }), mimeType);

      const db = await openDB();
      try {
        const fonts = await getFontManifest(db, gameId);
        const slot = slotName || slugify(file.name.replace(/\.[^.]+$/, ""));
        fonts[slot] = { name: file.name.replace(/\.[^.]+$/, ""), file: fileName, source: "upload" };
        await saveFontManifest(db, gameId, fonts);
        return { fonts };
      } finally {
        db.close();
      }
    },

    async deleteFont(gameId, file) {
      const assetPath = `/api/games/${gameId}/fonts/${file}`;
      await deleteAsset(assetPath);

      const db = await openDB();
      try {
        const fonts = await getFontManifest(db, gameId);
        for (const [key, entry] of Object.entries(fonts)) {
          if (entry.file === file) delete fonts[key];
        }
        await saveFontManifest(db, gameId, fonts);
        return { fonts };
      } finally {
        db.close();
      }
    },

    // ── Images ─────────────────────────────────────────────────────────────

    async uploadImage(gameId, file) {
      const buf = await file.arrayBuffer();
      const hash = await hashArrayBuffer(buf);
      const ext = file.name.includes(".") ? "." + file.name.split(".").pop() : "";
      const fileName = `${hash}${ext}`;
      const mimeType = file.type || "application/octet-stream";
      const assetPath = `/api/games/${gameId}/images/${fileName}`;

      await putAsset(assetPath, new Blob([buf], { type: mimeType }), mimeType);

      return assetPath;
    },
  };
};
