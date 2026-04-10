const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.file";
const DRIVE_API = "https://www.googleapis.com/drive/v3";
const DRIVE_UPLOAD = "https://www.googleapis.com/upload/drive/v3";

import { normalizeCard, normalizeLayout } from "../normalizeExport.js";
import { putAsset, deleteAsset, listAssets } from "./assetCache.js";

const loadGoogleScript = () =>
  new Promise((resolve, reject) => {
    if (window.google?.accounts?.oauth2) { resolve(); return; }
    const s = document.createElement("script");
    s.src = "https://accounts.google.com/gsi/client";
    s.async = true;
    s.defer = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("Failed to load Google Identity Services."));
    document.head.appendChild(s);
  });

const slugify = (v) => v.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
const escQ = (v) => String(v).replace(/\\/g, "\\\\").replace(/'/g, "\\'");
const now = () => new Date().toISOString();

export const createGoogleDriveStorage = (options = {}) => {
  const clientId = options.clientId ?? "";
  const appTag = options.appTag ?? "boardgame-assets";
  const rootFolderId = options.folderId ? String(options.folderId) : "";
  const defaultLayout = options.defaultLayout;
  const isConfigured = clientId && clientId.length > 10 && clientId.includes(".");

  if (typeof defaultLayout !== "function") throw new Error("Missing default layout factory.");

  const TOKEN_KEY = "boardgame_assets_google_token";
  let tokenClient = null;
  let accessToken = "";
  let tokenExpiry = 0;
  let initialized = false;

  // Folder ID cache: "path" -> driveId
  const folderIds = new Map();
  // File ID cache: "path/file.json" -> driveId
  const fileIds = new Map();
  // Content cache: driveId -> { data, ts }
  const contentCache = new Map();
  const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  const getCached = (fid) => {
    const entry = contentCache.get(fid);
    if (entry && Date.now() - entry.ts < CACHE_TTL) return entry.data;
    return undefined;
  };
  const setCache = (fid, data) => { contentCache.set(fid, { data, ts: Date.now() }); };
  const invalidateCache = (fid) => { contentCache.delete(fid); };
  const invalidateAll = () => { contentCache.clear(); };

  // --- Auth ---

  const saveToken = () => {
    try { if (accessToken) localStorage.setItem(TOKEN_KEY, JSON.stringify({ accessToken, tokenExpiry })); }
    catch {}
  };
  const loadToken = () => {
    try {
      const s = localStorage.getItem(TOKEN_KEY);
      if (s) { const p = JSON.parse(s); if (p.accessToken && Date.now() < p.tokenExpiry) { accessToken = p.accessToken; tokenExpiry = p.tokenExpiry; return true; } }
    } catch {}
    return false;
  };
  const clearToken = () => { try { localStorage.removeItem(TOKEN_KEY); } catch {} };

  const init = async () => {
    if (initialized) return;
    initialized = true;
    if (!isConfigured) return;
    await loadGoogleScript();
    tokenClient = window.google.accounts.oauth2.initTokenClient({ client_id: clientId, scope: DRIVE_SCOPE, callback: () => {} });
    loadToken();
  };

  const isAuthorized = () => Boolean(accessToken && Date.now() < tokenExpiry);

  const requestToken = (prompt) => new Promise((resolve, reject) => {
    tokenClient.callback = (r) => {
      if (r?.error) { reject(new Error(r.error)); return; }
      accessToken = r.access_token;
      tokenExpiry = Date.now() + (r.expires_in ?? 3600) * 1000 - 30000;
      saveToken();
      resolve();
    };
    tokenClient.requestAccessToken({ prompt });
  });

  const signIn = async () => {
    if (!initialized) throw new Error("Not initialized.");
    if (!isConfigured) throw new Error("Google Drive not configured.");
    await Promise.race([
      requestToken("consent"),
      new Promise((_, reject) => setTimeout(() => reject(new Error("Sign-in timed out. The popup may have been blocked — please allow popups for this site.")), 60000))
    ]);
  };

  const tryRestoreSession = async () => {
    if (!initialized) await init();
    if (isAuthorized()) return true;
    if (!isConfigured) return false;
    try {
      await Promise.race([
        requestToken("none"),
        new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 3000))
      ]);
      return true;
    } catch { return false; }
  };

  const signOut = async () => {
    if (accessToken) window.google.accounts.oauth2.revoke(accessToken, () => {});
    accessToken = ""; tokenExpiry = 0;
    clearToken(); folderIds.clear(); fileIds.clear(); contentCache.clear(); listingCache.clear();
  };

  const getToken = async () => {
    if (!initialized) await init();
    if (!isConfigured) throw new Error("Google Drive not configured.");
    if (isAuthorized()) return accessToken;
    throw new Error("Not signed in.");
  };

  // --- Drive primitives ---

  const drv = async (url, opts = {}) => {
    const t = await getToken();
    const r = await fetch(url, { ...opts, headers: { Authorization: `Bearer ${t}`, ...(opts.headers ?? {}) } });
    if (!r.ok) throw new Error(await r.text() || `Drive ${r.status}`);
    return r;
  };

  const drvJson = async (url, opts = {}) => (await drv(url, opts)).json();

  const queryFiles = async (q) => {
    const url = `${DRIVE_API}/files?q=${encodeURIComponent(q + " and trashed=false")}&fields=files(id,name,appProperties)`;
    return (await drvJson(url)).files ?? [];
  };

  // Listing caches
  const listingCache = new Map();
  const getCachedListing = (key) => {
    const entry = listingCache.get(key);
    if (entry && Date.now() - entry.ts < CACHE_TTL) return entry.data;
    return undefined;
  };
  const setCachedListing = (key, data) => { listingCache.set(key, { data, ts: Date.now() }); };

  const filesInFolder = async (fid, mime = "application/json") => {
    const key = `files:${fid}:${mime}`;
    const cached = getCachedListing(key);
    if (cached) return cached;
    const q = `mimeType='${escQ(mime)}' and '${escQ(fid)}' in parents and trashed=false`;
    const files = (await drvJson(`${DRIVE_API}/files?q=${encodeURIComponent(q)}&fields=files(id,name,appProperties)`)).files ?? [];
    setCachedListing(key, files);
    return files;
  };

  const foldersIn = async (fid) => {
    const key = `folders:${fid}`;
    const cached = getCachedListing(key);
    if (cached) return cached;
    const q = `mimeType='application/vnd.google-apps.folder' and '${escQ(fid)}' in parents and appProperties has { key='app' and value='${escQ(appTag)}' } and trashed=false`;
    const folders = (await drvJson(`${DRIVE_API}/files?q=${encodeURIComponent(q)}&fields=files(id,name,appProperties)`)).files ?? [];
    setCachedListing(key, folders);
    return folders;
  };

  const readFile = async (fid) => {
    const cached = getCached(fid);
    if (cached !== undefined) return cached;
    const data = await (await drv(`${DRIVE_API}/files/${fid}?alt=media`)).json();
    setCache(fid, data);
    return data;
  };

  const writeFile = async (fid, content) => {
    await drv(`${DRIVE_UPLOAD}/files/${fid}?uploadType=media`, {
      method: "PATCH", headers: { "Content-Type": "application/json; charset=UTF-8" },
      body: JSON.stringify(content, null, 2)
    });
    setCache(fid, content);
  };

  const mkFile = async (name, content, parentId, props = {}) => {
    const b = `b-${Math.random().toString(16).slice(2)}`;
    const meta = { name, mimeType: "application/json", appProperties: { app: appTag, ...props }, ...(parentId ? { parents: [parentId] } : {}) };
    const body = [`--${b}`, "Content-Type: application/json; charset=UTF-8", "", JSON.stringify(meta), `--${b}`, "Content-Type: application/json; charset=UTF-8", "", JSON.stringify(content, null, 2), `--${b}--`].join("\r\n");
    const r = await (await drv(`${DRIVE_UPLOAD}/files?uploadType=multipart&fields=id`, { method: "POST", headers: { "Content-Type": `multipart/related; boundary=${b}` }, body })).json();
    if (parentId) listingCache.delete(`files:${parentId}:application/json`);
    if (content) setCache(r.id, content);
    return r.id;
  };

  const mkFolder = async (name, parentId, props = {}) => {
    const meta = { name, mimeType: "application/vnd.google-apps.folder", appProperties: { app: appTag, ...props }, ...(parentId ? { parents: [parentId] } : {}) };
    const r = (await drvJson(`${DRIVE_API}/files?fields=id`, { method: "POST", headers: { "Content-Type": "application/json; charset=UTF-8" }, body: JSON.stringify(meta) })).id;
    if (parentId) listingCache.delete(`folders:${parentId}`);
    return r;
  };

  const rmFile = async (fid) => {
    await drv(`${DRIVE_API}/files/${fid}`, { method: "DELETE" });
    invalidateCache(fid);
  };

  const mkBinaryFile = async (name, mimeType, data, parentId, props = {}) => {
    const b = `b-${Math.random().toString(16).slice(2)}`;
    const meta = { name, mimeType, appProperties: { app: appTag, ...props }, ...(parentId ? { parents: [parentId] } : {}) };
    const metaBlob = new Blob([JSON.stringify(meta)], { type: "application/json; charset=UTF-8" });
    const body = new Blob([
      `--${b}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n`,
      metaBlob,
      `\r\n--${b}\r\nContent-Type: ${mimeType}\r\n\r\n`,
      data,
      `\r\n--${b}--`
    ]);
    const r = await (await drv(`${DRIVE_UPLOAD}/files?uploadType=multipart&fields=id`, {
      method: "POST", headers: { "Content-Type": `multipart/related; boundary=${b}` }, body
    })).json();
    return r.id;
  };


  // --- Folder resolution ---
  // Structure: root / <gameId> / { game.json, layouts/, collections/<colId>/{collection.json, cards/}, images/ }
  // Global: root / fonts / { fonts.json, *.woff2 }

  const ensureFolder = async (parentId, name, cacheKey, props = {}) => {
    const cached = folderIds.get(cacheKey);
    if (cached) return cached;
    const folders = await foldersIn(parentId);
    const existing = folders.find(f => f.name === name);
    if (existing) { folderIds.set(cacheKey, existing.id); return existing.id; }
    const id = await mkFolder(name, parentId, props);
    folderIds.set(cacheKey, id);
    return id;
  };

  const rootParent = () => rootFolderId || "root";

  const gameFolder = (gameId) => ensureFolder(rootParent(), gameId, `game:${gameId}`, { type: "game-folder", gameId });
  const layoutsFolder = async (gameId) => ensureFolder(await gameFolder(gameId), "layouts", `tpl:${gameId}`);
  const collectionsFolder = async (gameId) => ensureFolder(await gameFolder(gameId), "collections", `cols:${gameId}`);
  const collectionFolder = async (gameId, colId) => ensureFolder(await collectionsFolder(gameId), colId, `col:${gameId}:${colId}`, { type: "collection", collectionId: colId });
  const cardsFolder = async (gameId, colId) => ensureFolder(await collectionFolder(gameId, colId), "cards", `cards:${gameId}:${colId}`);
  const imagesFolder = async (gameId) => ensureFolder(await gameFolder(gameId), "images", `imgs:${gameId}`);

  // --- File helpers ---

  const findFile = async (name, folderId) => {
    const files = await filesInFolder(folderId);
    const found = files.find(f => f.name === name);
    return found ? found.id : null;
  };

  const findOrCreate = async (folderId, name, cacheKey, defaultContent, props = {}) => {
    const cached = fileIds.get(cacheKey);
    if (cached) return cached;
    const files = await filesInFolder(folderId);
    const found = files.find(f => f.name === name);
    if (found) { fileIds.set(cacheKey, found.id); return found.id; }
    const id = await mkFile(name, defaultContent, folderId, props);
    fileIds.set(cacheKey, id);
    return id;
  };

  const readOrCreate = async (folderId, name, cacheKey, defaultContent, props = {}) => {
    const fid = await findOrCreate(folderId, name, cacheKey, defaultContent, props);
    return await readFile(fid);
  };

  // --- Games ---

  const listGames = async () => {
    if (!isConfigured || !isAuthorized()) return [];
    try {
      const folders = await foldersIn(rootParent());
      const games = [];
      for (const f of folders) {
        if (f.appProperties?.type !== "game-folder") continue;
        folderIds.set(`game:${f.appProperties.gameId}`, f.id);
        const files = await filesInFolder(f.id);
        const gf = files.find(x => x.name === "game.json");
        if (gf) {
          const meta = await readFile(gf.id);
          if (meta?.id) { games.push(meta); fileIds.set(`game:${meta.id}`, gf.id); }
        }
      }
      games.sort((a, b) => a.name.localeCompare(b.name));
      return games;
    } catch (err) { console.warn("listGames:", err); return []; }
  };

  const getGame = async (gameId) => {
    const fid = await findOrCreate(await gameFolder(gameId), "game.json", `game:${gameId}`, null);
    const meta = await readFile(fid);
    if (!meta) throw new Error("Game not found.");
    return meta;
  };

  const createGame = async (name) => {
    const games = await listGames();
    const ids = new Set(games.map(g => g.id));
    let id = slugify(name) || `game-${Date.now()}`;
    let s = 1;
    while (ids.has(id)) id = `${slugify(name)}-${s++}`;
    const meta = { id, name, createdAt: now(), updatedAt: now() };
    const gf = await gameFolder(id);
    await mkFile("game.json", meta, gf, { type: "game", gameId: id });
    // Create default layout
    const tf = await layoutsFolder(id);
    const tpl = defaultLayout();
    await mkFile(`${tpl.id}.json`, tpl, tf, { type: "layout", gameId: id, layoutId: tpl.id });
    // Create default collection
    const cf = await collectionFolder(id, "default");
    await mkFile("collection.json", { id: "default", name: "Default", layoutId: tpl.id }, cf, { type: "collection", gameId: id });
    await ensureFolder(cf, "cards", `cards:${id}:default`);
    return meta;
  };

  const updateGame = async (gameId, updates) => {
    const fid = fileIds.get(`game:${gameId}`) ?? (await findOrCreate(await gameFolder(gameId), "game.json", `game:${gameId}`, null));
    const meta = await readFile(fid);
    const next = { ...meta, ...updates, updatedAt: now() };
    await writeFile(fid, next);
    return next;
  };

  const deleteGame = async (gameId) => {
    const fid = folderIds.get(`game:${gameId}`);
    if (fid) { await rmFile(fid); folderIds.delete(`game:${gameId}`); }
    // Clean caches
    for (const [k] of folderIds) { if (k.includes(gameId)) folderIds.delete(k); }
    for (const [k] of fileIds) { if (k.includes(gameId)) fileIds.delete(k); }
  };

  // --- Layouts ---

  const listLayouts = async (gameId) => {
    const tf = await layoutsFolder(gameId);
    const files = await filesInFolder(tf);
    const layouts = [];
    for (const f of files) {
      if (!f.name.endsWith(".json")) continue;
      const raw = await readFile(f.id);
      const tpl = normalizeLayout(raw);
      layouts.push(tpl);
      fileIds.set(`tpl:${gameId}:${tpl.id}`, f.id);
    }
    return layouts;
  };

  const getLayout = async (gameId, layoutId) => {
    const tf = await layoutsFolder(gameId);
    const fid = await findOrCreate(tf, `${layoutId}.json`, `tpl:${gameId}:${layoutId}`, defaultLayout());
    return normalizeLayout(await readFile(fid));
  };

  const saveLayout = async (gameId, layoutId, layout) => {
    const tf = await layoutsFolder(gameId);
    const fid = await findOrCreate(tf, `${layoutId}.json`, `tpl:${gameId}:${layoutId}`, layout);
    await writeFile(fid, layout);
    return layout;
  };

  const createLayout = async (gameId, name) => {
    const tf = await layoutsFolder(gameId);
    const tpl = defaultLayout();
    const id = slugify(name) || `layout-${Date.now()}`;
    tpl.id = id;
    tpl.name = name;
    const fid = await mkFile(`${id}.json`, tpl, tf, { type: "layout", gameId, layoutId: id });
    fileIds.set(`tpl:${gameId}:${id}`, fid);
    return tpl;
  };

  const deleteLayout = async (gameId, layoutId) => {
    const key = `tpl:${gameId}:${layoutId}`;
    const fid = fileIds.get(key);
    if (fid) { await rmFile(fid); fileIds.delete(key); }
  };

  const copyLayout = async (gameId, layoutId) => {
    const tpl = await getLayout(gameId, layoutId);
    const layouts = await listLayouts(gameId);
    const name = `Layout ${layouts.length + 1}`;
    const id = slugify(name) || `layout-${Date.now()}`;
    const copy = { ...tpl, id, name };
    const tf = await layoutsFolder(gameId);
    const fid = await mkFile(`${id}.json`, copy, tf, { type: "layout", gameId, layoutId: id });
    fileIds.set(`tpl:${gameId}:${id}`, fid);
    return copy;
  };

  // --- Collections ---

  const listCollections = async (gameId) => {
    const cf = await collectionsFolder(gameId);
    const folders = await foldersIn(cf);
    const collections = [];
    for (const f of folders) {
      folderIds.set(`col:${gameId}:${f.name}`, f.id);
      const files = await filesInFolder(f.id);
      const cFile = files.find(x => x.name === "collection.json");
      if (cFile) {
        const col = await readFile(cFile.id);
        if (col?.id) { collections.push(col); fileIds.set(`colmeta:${gameId}:${col.id}`, cFile.id); }
      }
    }
    return collections;
  };

  const getCollection = async (gameId, collectionId) => {
    const cf = await collectionFolder(gameId, collectionId);
    const fid = await findOrCreate(cf, "collection.json", `colmeta:${gameId}:${collectionId}`, { id: collectionId, name: collectionId, layoutId: "default" });
    return await readFile(fid);
  };

  const createCollection = async (gameId, name, layoutId) => {
    const id = slugify(name) || `col-${Date.now()}`;
    const col = { id, name, layoutId };
    const cf = await collectionFolder(gameId, id);
    await mkFile("collection.json", col, cf, { type: "collection", gameId, collectionId: id });
    await ensureFolder(cf, "cards", `cards:${gameId}:${id}`);
    return col;
  };

  const updateCollection = async (gameId, collectionId, updates) => {
    const key = `colmeta:${gameId}:${collectionId}`;
    const cf = await collectionFolder(gameId, collectionId);
    const fid = await findOrCreate(cf, "collection.json", key, { id: collectionId, name: collectionId, layoutId: "default" });
    const col = await readFile(fid);
    const next = { ...col, ...updates, id: collectionId };
    await writeFile(fid, next);
    return next;
  };

  const deleteCollection = async (gameId, collectionId) => {
    const fid = folderIds.get(`col:${gameId}:${collectionId}`);
    if (fid) { await rmFile(fid); folderIds.delete(`col:${gameId}:${collectionId}`); }
  };

  // --- Cards ---

  const listCards = async (gameId, collectionId) => {
    const cf = await cardsFolder(gameId, collectionId);
    const files = await filesInFolder(cf);
    const cards = [];
    for (const f of files) {
      if (!f.name.endsWith(".json")) continue;
      const raw = await readFile(f.id);
      const card = normalizeCard(raw);
      cards.push(card);
      fileIds.set(`card:${gameId}:${collectionId}:${card.id}`, f.id);
    }
    cards.sort((a, b) => a.name.localeCompare(b.name));
    return cards;
  };

  const getCard = async (gameId, collectionId, cardId) => {
    const cf = await cardsFolder(gameId, collectionId);
    const fid = await findOrCreate(cf, `${cardId}.json`, `card:${gameId}:${collectionId}:${cardId}`, null);
    const raw = await readFile(fid);
    if (!raw) throw new Error("Card not found.");
    return normalizeCard(raw);
  };

  const saveCard = async (gameId, collectionId, cardId, card) => {
    const normalized = normalizeCard({ ...card, id: cardId });
    const cf = await cardsFolder(gameId, collectionId);
    const key = `card:${gameId}:${collectionId}:${cardId}`;
    const cached = fileIds.get(key);
    if (cached) {
      await writeFile(cached, normalized);
    } else {
      const fid = await mkFile(`${cardId}.json`, normalized, cf, { type: "card", gameId, collectionId, cardId });
      fileIds.set(key, fid);
    }
    return normalized;
  };

  const deleteCard = async (gameId, collectionId, cardId) => {
    const key = `card:${gameId}:${collectionId}:${cardId}`;
    const fid = fileIds.get(key);
    if (fid) { await rmFile(fid); fileIds.delete(key); }
  };

  const copyCard = async (gameId, collectionId, cardId) => {
    const card = await getCard(gameId, collectionId, cardId);
    const cards = await listCards(gameId, collectionId);
    const name = `New Card ${cards.length + 1}`;
    const id = slugify(name) || `card-${Date.now()}`;
    return await saveCard(gameId, collectionId, id, { ...card, id, name });
  };

  // --- Fonts (per-game) ---

  const gameFontsFolder = async (gameId) => {
    const gf = await gameFolder(gameId);
    return ensureFolder(gf, "fonts", `fonts:${gameId}`, { type: "fonts", gameId });
  };

  const gameFontsManifest = async (gameId) => {
    const folder = await gameFontsFolder(gameId);
    let fid = await findFile("fonts.json", folder);
    if (!fid) {
      fid = await mkFile("fonts.json", {}, folder, { type: "fonts-manifest", gameId });
    }
    const data = await readFile(fid);
    return { fid, data: typeof data === "object" && data !== null ? data : {} };
  };

  const listFonts = async (gameId) => {
    const { data } = await gameFontsManifest(gameId);
    return data;
  };

  const addGoogleFont = async (gameId, name, slotName) => {
    // Store reference only — actual download requires server
    const { fid, data } = await gameFontsManifest(gameId);
    const slot = slotName || name.toLowerCase().replace(/\s+/g, "-");
    data[slot] = { name, file: "", source: "google" };
    await writeFile(fid, data);
    return { fonts: data };
  };

  const uploadFont = async (gameId, file, slotName) => {
    const folder = await gameFontsFolder(gameId);
    const mimeType = file.type || "application/octet-stream";
    const arrayBuf = await file.arrayBuffer();
    await mkBinaryFile(file.name, mimeType, arrayBuf, folder, { type: "font", gameId });
    // Store in asset cache for SW to serve
    const urlPath = `/api/games/${gameId}/fonts/${file.name}`;
    await putAsset(urlPath, new Blob([arrayBuf], { type: mimeType }), mimeType);
    // Update manifest
    const { fid, data } = await gameFontsManifest(gameId);
    const slot = slotName || file.name.replace(/\.[^.]+$/, "");
    data[slot] = { name: file.name.replace(/\.[^.]+$/, ""), file: file.name, source: "upload" };
    await writeFile(fid, data);
    return { fonts: data };
  };

  const deleteFont = async (gameId, file) => {
    const { fid, data } = await gameFontsManifest(gameId);
    for (const [k, v] of Object.entries(data)) {
      if (v.file === file) delete data[k];
    }
    await writeFile(fid, data);
    await deleteAsset(`/api/games/${gameId}/fonts/${file}`);
    return { fonts: data };
  };

  // --- Images ---

  const uploadImage = async (gameId, file) => {
    const imgFolder = await imagesFolder(gameId);
    const mimeType = file.type || "application/octet-stream";
    const arrayBuf = await file.arrayBuffer();
    await mkBinaryFile(file.name, mimeType, arrayBuf, imgFolder, { type: "image", gameId });
    const urlPath = `/api/games/${gameId}/images/${file.name}`;
    await putAsset(urlPath, new Blob([arrayBuf], { type: mimeType }), mimeType);
    return urlPath;
  };

  return {
    init, signIn, signOut, tryRestoreSession, isAuthorized,
    listGames, getGame, createGame, updateGame, deleteGame,
    listLayouts, getLayout, saveLayout, createLayout, deleteLayout, copyLayout,
    listCollections, getCollection, createCollection, updateCollection, deleteCollection,
    listCards, getCard, saveCard, deleteCard, copyCard,
    listFonts, addGoogleFont, uploadFont, deleteFont,
    uploadImage,
  };
};
