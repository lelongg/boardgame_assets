/**
 * S3-compatible storage backend.
 * Works with AWS S3, MinIO, Cloudflare R2, and other S3-compatible services.
 */

import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command,
} from "@aws-sdk/client-s3";
import { getAsset, putAsset, deleteAsset } from "./assetCache.js";
import { normalizeCard, normalizeLayout } from "../normalizeExport.js";

// ── Utilities ──────────────────────────────────────────────────────────────

const slugify = (v) =>
  v.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

const uid = () => Math.random().toString(36).slice(2, 10);

const now = () => new Date().toISOString();

const hashArrayBuffer = async (buf) => {
  const hash = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 12);
};

// ── Factory ────────────────────────────────────────────────────────────────

export const createS3Storage = (options = {}) => {
  const {
    defaultLayout,
    bucket,
    region = "us-east-1",
    accessKeyId,
    secretAccessKey,
    endpoint,
    prefix = "boardgame-assets",
  } = options;

  const client = new S3Client({
    region,
    credentials: accessKeyId && secretAccessKey
      ? { accessKeyId, secretAccessKey }
      : undefined,
    ...(endpoint ? { endpoint, forcePathStyle: true } : {}),
  });

  // ── S3 helpers ──────────────────────────────────────────────────────────

  const getJson = async (key) => {
    const resp = await client.send(
      new GetObjectCommand({ Bucket: bucket, Key: key })
    );
    return JSON.parse(await resp.Body.transformToString());
  };

  const putJson = async (key, data) => {
    await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: JSON.stringify(data, null, 2),
        ContentType: "application/json",
      })
    );
  };

  const putBinary = async (key, body, contentType) => {
    await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
      })
    );
  };

  const deleteObject = async (key) => {
    await client.send(
      new DeleteObjectCommand({ Bucket: bucket, Key: key })
    );
  };

  /**
   * List all object keys under a given prefix.
   * Handles pagination via ContinuationToken.
   */
  const listKeys = async (keyPrefix) => {
    const keys = [];
    let continuationToken;
    do {
      const resp = await client.send(
        new ListObjectsV2Command({
          Bucket: bucket,
          Prefix: keyPrefix,
          ContinuationToken: continuationToken,
        })
      );
      if (resp.Contents) {
        for (const obj of resp.Contents) {
          keys.push(obj.Key);
        }
      }
      continuationToken = resp.IsTruncated ? resp.NextContinuationToken : undefined;
    } while (continuationToken);
    return keys;
  };

  /**
   * List "directory" common prefixes (one level deep).
   */
  const listCommonPrefixes = async (keyPrefix, delimiter = "/") => {
    const prefixes = [];
    let continuationToken;
    do {
      const resp = await client.send(
        new ListObjectsV2Command({
          Bucket: bucket,
          Prefix: keyPrefix,
          Delimiter: delimiter,
          ContinuationToken: continuationToken,
        })
      );
      if (resp.CommonPrefixes) {
        for (const cp of resp.CommonPrefixes) {
          prefixes.push(cp.Prefix);
        }
      }
      continuationToken = resp.IsTruncated ? resp.NextContinuationToken : undefined;
    } while (continuationToken);
    return prefixes;
  };

  /**
   * Delete all objects under a prefix (S3 has no recursive delete).
   */
  const deleteAllWithPrefix = async (keyPrefix) => {
    const keys = await listKeys(keyPrefix);
    for (const key of keys) {
      await deleteObject(key);
    }
  };

  // ── Key builders ────────────────────────────────────────────────────────

  const gameKey = (gameId) => `${prefix}/${gameId}/game.json`;
  const layoutKey = (gameId, layoutId) =>
    `${prefix}/${gameId}/layouts/${layoutId}.json`;
  const collectionKey = (gameId, collectionId) =>
    `${prefix}/${gameId}/collections/${collectionId}/collection.json`;
  const cardKey = (gameId, collectionId, cardId) =>
    `${prefix}/${gameId}/collections/${collectionId}/cards/${cardId}.json`;
  const fontsManifestKey = (gameId) =>
    `${prefix}/${gameId}/fonts/fonts.json`;

  // ── Font manifest helpers ───────────────────────────────────────────────

  const getFontManifest = async (gameId) => {
    try {
      return await getJson(fontsManifestKey(gameId));
    } catch {
      return {};
    }
  };

  const saveFontManifest = async (gameId, manifest) => {
    await putJson(fontsManifestKey(gameId), manifest);
  };

  // ── Storage interface ───────────────────────────────────────────────────

  return {
    // ── Lifecycle ──────────────────────────────────────────────────────────

    async init() {},
    async tryRestoreSession() {},
    isAuthorized() {
      return Boolean(bucket && accessKeyId);
    },
    async signIn() {},
    async signOut() {},

    // ── Games ──────────────────────────────────────────────────────────────

    async listGames() {
      const dirs = await listCommonPrefixes(`${prefix}/`);
      const games = [];
      for (const dir of dirs) {
        // dir looks like "boardgame-assets/my-game-abc123/"
        const gameId = dir.slice(`${prefix}/`.length, -1);
        if (!gameId) continue;
        try {
          const game = await getJson(gameKey(gameId));
          games.push(game);
        } catch {
          // game.json missing or corrupt — skip
        }
      }
      games.sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
      return games;
    },

    async getGame(gameId) {
      return await getJson(gameKey(gameId));
    },

    async createGame(name) {
      const gameId = slugify(name) + "-" + uid();
      const game = {
        id: gameId,
        name,
        createdAt: now(),
        updatedAt: now(),
      };
      await putJson(gameKey(gameId), game);

      // Create a default layout
      const layoutId = "default";
      const layout = normalizeLayout(
        defaultLayout ? defaultLayout() : { id: layoutId, name: "Default" }
      );
      layout.id = layoutId;
      await putJson(layoutKey(gameId, layoutId), layout);

      // Create a default collection
      const collectionId = "default";
      const collection = {
        id: collectionId,
        name: "Default",
        layoutId,
        createdAt: now(),
      };
      await putJson(collectionKey(gameId, collectionId), collection);

      return game;
    },

    async updateGame(gameId, updates) {
      const game = await getJson(gameKey(gameId));
      const updated = { ...game, ...updates, id: gameId, updatedAt: now() };
      await putJson(gameKey(gameId), updated);
      return updated;
    },

    async deleteGame(gameId) {
      await deleteAllWithPrefix(`${prefix}/${gameId}/`);
    },

    // ── Layouts ──────────────────────────────────────────────────────────

    async listLayouts(gameId) {
      const keys = await listKeys(`${prefix}/${gameId}/layouts/`);
      const layouts = [];
      for (const key of keys) {
        if (!key.endsWith(".json")) continue;
        try {
          const tpl = await getJson(key);
          layouts.push(tpl);
        } catch {
          // corrupt file — skip
        }
      }
      return layouts;
    },

    async getLayout(gameId, layoutId) {
      return await getJson(layoutKey(gameId, layoutId));
    },

    async saveLayout(gameId, layoutId, layout) {
      const normalized = normalizeLayout({ ...layout, id: layoutId });
      await putJson(layoutKey(gameId, layoutId), normalized);
      return normalized;
    },

    async createLayout(gameId, name) {
      const layoutId = slugify(name) + "-" + uid();
      const layout = normalizeLayout(
        defaultLayout
          ? { ...defaultLayout(), id: layoutId, name }
          : { id: layoutId, name }
      );
      await putJson(layoutKey(gameId, layoutId), layout);
      return layout;
    },

    async copyLayout(gameId, layoutId) {
      const source = await getJson(layoutKey(gameId, layoutId));
      const newId = slugify(source.name) + "-" + uid();
      const copy = normalizeLayout({
        ...source,
        id: newId,
        name: `${source.name} (copy)`,
      });
      await putJson(layoutKey(gameId, newId), copy);
      return copy;
    },

    async deleteLayout(gameId, layoutId) {
      await deleteObject(layoutKey(gameId, layoutId));
    },

    // ── Collections ────────────────────────────────────────────────────────

    async listCollections(gameId) {
      const dirs = await listCommonPrefixes(
        `${prefix}/${gameId}/collections/`
      );
      const collections = [];
      for (const dir of dirs) {
        // dir looks like "boardgame-assets/gid/collections/colId/"
        const parts = dir.split("/");
        const collectionId = parts[parts.length - 2];
        if (!collectionId) continue;
        try {
          const col = await getJson(
            collectionKey(gameId, collectionId)
          );
          collections.push(col);
        } catch {
          // missing or corrupt — skip
        }
      }
      return collections;
    },

    async getCollection(gameId, collectionId) {
      return await getJson(collectionKey(gameId, collectionId));
    },

    async createCollection(gameId, name, layoutId) {
      const collectionId = slugify(name) + "-" + uid();
      const collection = {
        id: collectionId,
        name,
        layoutId,
        createdAt: now(),
      };
      await putJson(collectionKey(gameId, collectionId), collection);
      return collection;
    },

    async updateCollection(gameId, collectionId, updates) {
      const col = await getJson(collectionKey(gameId, collectionId));
      const updated = { ...col, ...updates, id: collectionId, updatedAt: now() };
      await putJson(collectionKey(gameId, collectionId), updated);
      return updated;
    },

    async deleteCollection(gameId, collectionId) {
      await deleteAllWithPrefix(
        `${prefix}/${gameId}/collections/${collectionId}/`
      );
    },

    // ── Cards ──────────────────────────────────────────────────────────────

    async listCards(gameId, collectionId) {
      const keys = await listKeys(
        `${prefix}/${gameId}/collections/${collectionId}/cards/`
      );
      const cards = [];
      for (const key of keys) {
        if (!key.endsWith(".json")) continue;
        try {
          const card = await getJson(key);
          cards.push(card);
        } catch {
          // corrupt — skip
        }
      }
      return cards;
    },

    async getCard(gameId, collectionId, cardId) {
      return await getJson(cardKey(gameId, collectionId, cardId));
    },

    async saveCard(gameId, collectionId, cardId, card) {
      const id = cardId || uid();
      const normalized = normalizeCard({ ...card, id });
      await putJson(cardKey(gameId, collectionId, id), normalized);
      return normalized;
    },

    async copyCard(gameId, collectionId, cardId) {
      const source = await getJson(cardKey(gameId, collectionId, cardId));
      const newId = uid();
      const copy = normalizeCard({
        ...source,
        id: newId,
        name: `${source.name} (copy)`,
      });
      await putJson(cardKey(gameId, collectionId, newId), copy);
      return copy;
    },

    async deleteCard(gameId, collectionId, cardId) {
      await deleteObject(cardKey(gameId, collectionId, cardId));
    },

    // ── Fonts ──────────────────────────────────────────────────────────────

    async listFonts(gameId) {
      return await getFontManifest(gameId);
    },

    async addGoogleFont(gameId, name, slotName) {
      // Fetch the CSS from Google Fonts to get the woff2 URL
      const cssUrl = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(name)}`;
      const cssResp = await fetch(cssUrl);
      if (!cssResp.ok)
        throw new Error(`Failed to fetch Google Font CSS for "${name}"`);
      const css = await cssResp.text();

      // Extract the first woff2 URL
      const match = css.match(
        /src:\s*url\((https:\/\/[^)]+\.woff2)\)\s*format\(['"]woff2['"]\)/
      );
      if (!match)
        throw new Error(`No woff2 URL found in Google Font CSS for "${name}"`);
      const woff2Url = match[1];

      // Download the font binary
      const fontResp = await fetch(woff2Url);
      if (!fontResp.ok)
        throw new Error(`Failed to download font binary for "${name}"`);
      const buf = await fontResp.arrayBuffer();
      const hash = await hashArrayBuffer(buf);
      const fileName = `${hash}.woff2`;

      // Upload to S3
      const s3Key = `${prefix}/${gameId}/fonts/${fileName}`;
      await putBinary(s3Key, new Uint8Array(buf), "font/woff2");

      // Also store in asset cache for the SW/fetch interceptor
      const assetPath = `/api/games/${gameId}/fonts/${fileName}`;
      await putAsset(assetPath, new Blob([buf], { type: "font/woff2" }), "font/woff2");

      // Update the manifest
      const fonts = await getFontManifest(gameId);
      const slot = slotName || slugify(name);
      fonts[slot] = { name, file: fileName, source: "google" };
      await saveFontManifest(gameId, fonts);

      return { fonts };
    },

    async uploadFont(gameId, file, slotName) {
      const buf = await file.arrayBuffer();
      const hash = await hashArrayBuffer(buf);
      const ext = file.name.includes(".") ? "." + file.name.split(".").pop() : "";
      const fileName = `${hash}${ext}`;
      const mimeType = file.type || "font/woff2";

      // Upload to S3
      const s3Key = `${prefix}/${gameId}/fonts/${fileName}`;
      await putBinary(s3Key, new Uint8Array(buf), mimeType);

      // Also store in asset cache
      const assetPath = `/api/games/${gameId}/fonts/${fileName}`;
      await putAsset(assetPath, new Blob([buf], { type: mimeType }), mimeType);

      // Update the manifest
      const fonts = await getFontManifest(gameId);
      const slot = slotName || slugify(file.name.replace(/\.[^.]+$/, ""));
      fonts[slot] = {
        name: file.name.replace(/\.[^.]+$/, ""),
        file: fileName,
        source: "upload",
      };
      await saveFontManifest(gameId, fonts);

      return { fonts };
    },

    async deleteFont(gameId, file) {
      // Delete binary from S3
      const s3Key = `${prefix}/${gameId}/fonts/${file}`;
      await deleteObject(s3Key);

      // Delete from asset cache
      const assetPath = `/api/games/${gameId}/fonts/${file}`;
      await deleteAsset(assetPath);

      // Update the manifest
      const fonts = await getFontManifest(gameId);
      for (const [key, entry] of Object.entries(fonts)) {
        if (entry.file === file) delete fonts[key];
      }
      await saveFontManifest(gameId, fonts);

      return { fonts };
    },

    // ── Images ─────────────────────────────────────────────────────────────

    async uploadImage(gameId, file) {
      const buf = await file.arrayBuffer();
      const hash = await hashArrayBuffer(buf);
      const ext = file.name.includes(".") ? "." + file.name.split(".").pop() : "";
      const fileName = `${hash}${ext}`;
      const mimeType = file.type || "application/octet-stream";

      // Upload to S3
      const s3Key = `${prefix}/${gameId}/images/${fileName}`;
      await putBinary(s3Key, new Uint8Array(buf), mimeType);

      // Also store in asset cache
      const assetPath = `/api/games/${gameId}/images/${fileName}`;
      await putAsset(assetPath, new Blob([buf], { type: mimeType }), mimeType);

      // Store original filename as display name
      const namesKey = `${prefix}/${gameId}/images/_names.json`;
      let names = {};
      try { names = await getJson(namesKey); } catch {}
      if (!names[fileName]) {
        const displayName = file.name.includes(".") ? file.name.slice(0, file.name.lastIndexOf(".")) : file.name;
        names[fileName] = displayName || fileName;
        await putJson(namesKey, names);
      }

      return assetPath;
    },

    async renameImage(gameId, file, newName) {
      const namesKey = `${prefix}/${gameId}/images/_names.json`;
      let names = {};
      try { names = await getJson(namesKey); } catch {}
      names[file] = newName;
      await putJson(namesKey, names);
    },
  };
};
