const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.file";
const DRIVE_API = "https://www.googleapis.com/drive/v3";
const DRIVE_UPLOAD = "https://www.googleapis.com/upload/drive/v3";

import { normalizeCard, normalizeTemplate } from "../normalizeExport.js";

const loadGoogleScript = () =>
  new Promise((resolve, reject) => {
    if (window.google?.accounts?.oauth2) {
      resolve();
      return;
    }
    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Failed to load Google Identity Services."));
    document.head.appendChild(script);
  });

const slugify = (value) =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

const escapeQueryValue = (value) => String(value).replace(/\\/g, "\\\\").replace(/'/g, "\\'");

const toIsoNow = () => new Date().toISOString();

export const createGoogleDriveStorage = (options = {}) => {
  const clientId = options.clientId ?? "";
  const appTag = options.appTag ?? "boardgame-assets";
  const folderId = options.folderId ? String(options.folderId) : "";
  const defaultTemplate = options.defaultTemplate;

  // Check if client ID is properly configured (but don't throw yet)
  const isConfigured = clientId && !clientId.includes("YOUR_GOOGLE_CLIENT_ID");
  
  if (typeof defaultTemplate !== "function") {
    throw new Error("Missing default template factory.");
  }

  const TOKEN_STORAGE_KEY = "boardgame_assets_google_token";

  let tokenClient = null;
  let accessToken = "";
  let tokenExpiry = 0;
  let initialized = false;

  const fileCache = new Map();
  const gameCache = new Map();
  const folderCache = new Map();

  const saveTokenToStorage = () => {
    try {
      if (typeof accessToken === "string" && accessToken.length > 0 && typeof tokenExpiry === "number" && tokenExpiry > 0) {
        localStorage.setItem(
          TOKEN_STORAGE_KEY,
          JSON.stringify({ accessToken, tokenExpiry })
        );
      }
    } catch (err) {
      console.warn("Failed to save token to localStorage:", err);
    }
  };

  const loadTokenFromStorage = () => {
    try {
      const stored = localStorage.getItem(TOKEN_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        const token = parsed?.accessToken;
        const expiry = parsed?.tokenExpiry;
        if (typeof token === "string" && token.length > 0 && typeof expiry === "number" && expiry > 0) {
          if (Date.now() < expiry) {
            accessToken = token;
            tokenExpiry = expiry;
            return true;
          }
        }
      }
    } catch (err) {
      console.warn("Failed to load token from localStorage:", err);
    }
    return false;
  };

  const clearTokenFromStorage = () => {
    try {
      localStorage.removeItem(TOKEN_STORAGE_KEY);
    } catch (err) {
      console.warn("Failed to clear token from localStorage:", err);
    }
  };

  const init = async () => {
    if (initialized) return;
    if (!isConfigured) {
      // Don't throw - just mark as initialized but not configured
      // Error will be shown when user tries to actually use Google Drive
      initialized = true;
      return;
    }
    await loadGoogleScript();
    tokenClient = window.google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: DRIVE_SCOPE,
      callback: () => {}
    });
    loadTokenFromStorage();
    initialized = true;
  };

  const isAuthorized = () => Boolean(accessToken && Date.now() < tokenExpiry);

  const requestToken = (prompt) =>
    new Promise((resolve, reject) => {
      tokenClient.callback = (response) => {
        if (response?.error) {
          reject(new Error(response.error));
          return;
        }
        accessToken = response.access_token;
        const expiresInMs = (response.expires_in ?? 3600) * 1000;
        const bufferMs = Math.min(30_000, expiresInMs / 2);
        tokenExpiry = Date.now() + expiresInMs - bufferMs;
        saveTokenToStorage();
        resolve();
      };
      tokenClient.requestAccessToken({ prompt });
    });

  const signIn = async () => {
    // Ensure init has been called before signIn is used
    if (!initialized) {
      throw new Error("Google Drive storage not initialized. Call init() during application startup.");
    }
    if (!isConfigured) {
      throw new Error("Google Drive is not configured. The GOOGLE_CLIENT_ID environment variable was not set during build. Please contact the site administrator.");
    }
    // Call requestToken immediately to maintain user gesture context for popup
    await requestToken("consent");
  };

  const tryRestoreSession = async () => {
    // Init is required for session restore
    if (!initialized) {
      await init();
    }
    if (isAuthorized()) return true;
    try {
      await requestToken("none");
      return true;
    } catch (err) {
      return false;
    }
  };

  const signOut = async () => {
    if (!accessToken) return;
    window.google.accounts.oauth2.revoke(accessToken, () => {});
    accessToken = "";
    tokenExpiry = 0;
    clearTokenFromStorage();
    fileCache.clear();
    gameCache.clear();
    folderCache.clear();
  };

  const getAccessToken = async () => {
    // Fallback to init() for background token refresh (doesn't require user gesture)
    // Unlike signIn(), this uses silent "none" prompt which doesn't open a popup
    if (!initialized) {
      await init();
    }
    if (!isConfigured) {
      throw new Error("Google Drive is not configured. The GOOGLE_CLIENT_ID environment variable was not set during build. Please contact the site administrator.");
    }
    if (isAuthorized()) return accessToken;
    try {
      await requestToken("none");
      return accessToken;
    } catch (err) {
      throw new Error("Not signed in to Google Drive.");
    }
  };

  const driveFetch = async (url, options = {}) => {
    const token = await getAccessToken();
    const response = await fetch(url, {
      ...options,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(options.headers ?? {})
      }
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(text || `Drive request failed (${response.status})`);
    }
    return response;
  };

  const driveFetchJson = async (url, options = {}) => {
    const response = await driveFetch(url, options);
    return response.json();
  };

  const buildQuery = (filters) => {
    const parts = [`appProperties has { key='app' and value='${escapeQueryValue(appTag)}' }`];
    Object.entries(filters).forEach(([key, value]) => {
      parts.push(`appProperties has { key='${escapeQueryValue(key)}' and value='${escapeQueryValue(value)}' }`);
    });
    parts.push("trashed=false");
    return parts.join(" and ");
  };

  const listFiles = async (filters) => {
    const q = buildQuery(filters);
    const url = `${DRIVE_API}/files?q=${encodeURIComponent(q)}&fields=files(id,name,appProperties,createdTime,modifiedTime)`;
    const data = await driveFetchJson(url);
    return data.files ?? [];
  };

  const listFilesInFolder = async (folderId, mimeType = "application/json") => {
    const q = [
      `mimeType='${escapeQueryValue(mimeType)}'`,
      `'${escapeQueryValue(folderId)}' in parents`,
      "trashed=false"
    ].join(" and ");
    const url = `${DRIVE_API}/files?q=${encodeURIComponent(q)}&fields=files(id,name,appProperties,createdTime,modifiedTime)`;
    const data = await driveFetchJson(url);
    return data.files ?? [];
  };

  const getFileContent = async (fileId) => {
    const url = `${DRIVE_API}/files/${fileId}?alt=media`;
    const response = await driveFetch(url);
    return response.json();
  };

  const getParentsArray = (parentId) => {
    if (parentId) return [parentId];
    if (folderId) return [folderId];
    return undefined;
  };

  const createFile = async ({ name, content, appProperties, parentId }) => {
    const boundary = `boundary-${Math.random().toString(16).slice(2)}`;
    const parents = getParentsArray(parentId);
    const metadata = {
      name,
      mimeType: "application/json",
      appProperties,
      ...(parents ? { parents } : {})
    };
    const body = [
      `--${boundary}`,
      "Content-Type: application/json; charset=UTF-8",
      "",
      JSON.stringify(metadata),
      `--${boundary}`,
      "Content-Type: application/json; charset=UTF-8",
      "",
      JSON.stringify(content, null, 2),
      `--${boundary}--`
    ].join("\r\n");

    const response = await driveFetch(`${DRIVE_UPLOAD}/files?uploadType=multipart&fields=id`, {
      method: "POST",
      headers: { "Content-Type": `multipart/related; boundary=${boundary}` },
      body
    });
    const data = await response.json();
    return data.id;
  };

  const updateFileContent = async (fileId, content) => {
    await driveFetch(`${DRIVE_UPLOAD}/files/${fileId}?uploadType=media`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json; charset=UTF-8" },
      body: JSON.stringify(content, null, 2)
    });
  };

  const deleteFile = async (fileId) => {
    await driveFetch(`${DRIVE_API}/files/${fileId}`, { method: "DELETE" });
  };

  const createFolder = async ({ name, parentId, appProperties }) => {
    const parents = getParentsArray(parentId);
    const metadata = {
      name,
      mimeType: "application/vnd.google-apps.folder",
      appProperties,
      ...(parents ? { parents } : {})
    };
    const data = await driveFetchJson(`${DRIVE_API}/files?fields=id`, {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=UTF-8" },
      body: JSON.stringify(metadata)
    });
    return data.id;
  };

  const listFoldersInParent = async (parentId) => {
    const q = [
      `mimeType='application/vnd.google-apps.folder'`,
      `'${escapeQueryValue(parentId)}' in parents`,
      `appProperties has { key='app' and value='${escapeQueryValue(appTag)}' }`,
      "trashed=false"
    ].join(" and ");
    const url = `${DRIVE_API}/files?q=${encodeURIComponent(q)}&fields=files(id,name,appProperties)`;
    const data = await driveFetchJson(url);
    return data.files ?? [];
  };

  const ensureGameFolder = async (gameId) => {
    const cached = folderCache.get(`game:${gameId}`);
    if (cached) return cached;

    const parentFolder = folderId || "root";
    const folders = await listFoldersInParent(parentFolder);
    const existing = folders.find((f) => f.appProperties?.gameId === gameId);
    
    if (existing) {
      folderCache.set(`game:${gameId}`, existing.id);
      return existing.id;
    }

    const newFolderId = await createFolder({
      name: gameId,
      parentId: parentFolder === "root" ? null : parentFolder,
      appProperties: {
        app: appTag,
        type: "game-folder",
        gameId
      }
    });
    folderCache.set(`game:${gameId}`, newFolderId);
    return newFolderId;
  };

  const ensureCardsFolder = async (gameId) => {
    const cached = folderCache.get(`cards:${gameId}`);
    if (cached) return cached;

    const gameFolderId = await ensureGameFolder(gameId);
    const folders = await listFoldersInParent(gameFolderId);
    const existing = folders.find((f) => f.name === "cards");
    
    if (existing) {
      folderCache.set(`cards:${gameId}`, existing.id);
      return existing.id;
    }

    const newFolderId = await createFolder({
      name: "cards",
      parentId: gameFolderId,
      appProperties: {
        app: appTag,
        type: "cards-folder",
        gameId
      }
    });
    folderCache.set(`cards:${gameId}`, newFolderId);
    return newFolderId;
  };

  const fileKey = (type, gameId, cardId = "") => `${type}:${gameId}:${cardId}`;

  const cacheFile = (type, gameId, cardId, fileId) => {
    fileCache.set(fileKey(type, gameId, cardId), fileId);
  };

  const getCachedFile = (type, gameId, cardId) => fileCache.get(fileKey(type, gameId, cardId));

  const resolveFileId = async (type, gameId, cardId) => {
    const cached = getCachedFile(type, gameId, cardId);
    if (cached) return cached;
    
    // Try to find file in the appropriate folder first (new structure)
    if (type === "game") {
      const gameFolderId = folderCache.get(`game:${gameId}`);
      if (gameFolderId) {
        const files = await listFilesInFolder(gameFolderId);
        const gameFile = files.find((f) => f.name === "game.json");
        if (gameFile) {
          cacheFile(type, gameId, cardId, gameFile.id);
          return gameFile.id;
        }
      }
    } else if (type === "template") {
      const gameFolderId = folderCache.get(`game:${gameId}`);
      if (gameFolderId) {
        const files = await listFilesInFolder(gameFolderId);
        const templateFile = files.find((f) => f.name === "template.json");
        if (templateFile) {
          cacheFile(type, gameId, cardId, templateFile.id);
          return templateFile.id;
        }
      }
    } else if (type === "card") {
      const cardsFolderId = folderCache.get(`cards:${gameId}`);
      if (cardsFolderId) {
        const files = await listFilesInFolder(cardsFolderId);
        const cardFile = files.find((f) => f.name === `${cardId}.json`);
        if (cardFile) {
          cacheFile(type, gameId, cardId, cardFile.id);
          return cardFile.id;
        }
      }
    }
    
    // Fall back to legacy flat structure (backward compatibility)
    const files = await listFiles({
      type,
      gameId,
      ...(cardId ? { cardId } : {})
    });
    if (!files.length) return null;
    const fileId = files[0].id;
    cacheFile(type, gameId, cardId, fileId);
    return fileId;
  };

  const readGame = async (gameId) => {
    const cached = gameCache.get(gameId);
    if (cached?.meta) return cached.meta;
    const fileId = await resolveFileId("game", gameId);
    if (!fileId) return null;
    const meta = await getFileContent(fileId);
    gameCache.set(gameId, { fileId, meta });
    return meta;
  };

  const writeGame = async (meta) => {
    const gameId = meta.id;
    const fileId = await resolveFileId("game", gameId);
    if (fileId) {
      await updateFileContent(fileId, meta);
      gameCache.set(gameId, { fileId, meta });
      return meta;
    }
    const gameFolderId = await ensureGameFolder(gameId);
    const createdId = await createFile({
      name: "game.json",
      content: meta,
      appProperties: {
        app: appTag,
        type: "game",
        gameId
      },
      parentId: gameFolderId
    });
    cacheFile("game", gameId, "", createdId);
    gameCache.set(gameId, { fileId: createdId, meta });
    return meta;
  };

  const touchGame = async (gameId) => {
    const meta = await readGame(gameId);
    if (!meta) return;
    meta.updatedAt = toIsoNow();
    await writeGame(meta);
  };

  const listGames = async () => {
    if (!isConfigured) {
      // Return empty array if not configured - user needs to sign in first
      return [];
    }
    
    try {
      const parentFolder = folderId || "root";
      const folders = await listFoldersInParent(parentFolder);
      const games = [];
      const seenGameIds = new Set();
      
      for (const folder of folders) {
        if (folder.appProperties?.type === "game-folder") {
          const gameId = folder.appProperties.gameId;
          folderCache.set(`game:${gameId}`, folder.id);
          
          // Look for game.json in the folder
          const files = await listFilesInFolder(folder.id);
          const gameFile = files.find((f) => f.name === "game.json");
          
          if (gameFile) {
            const meta = await getFileContent(gameFile.id);
            if (meta?.id) {
              games.push(meta);
              seenGameIds.add(meta.id);
              cacheFile("game", meta.id, "", gameFile.id);
              gameCache.set(meta.id, { fileId: gameFile.id, meta });
            }
          }
        }
      }
      
      // Also check for legacy flat structure games for backward compatibility
      const legacyFiles = await listFiles({ type: "game" });
      for (const file of legacyFiles) {
        const meta = await getFileContent(file.id);
        if (meta?.id && !seenGameIds.has(meta.id)) {
          games.push(meta);
          seenGameIds.add(meta.id);
          cacheFile("game", meta.id, "", file.id);
          gameCache.set(meta.id, { fileId: file.id, meta });
        }
      }
      
      games.sort((a, b) => a.name.localeCompare(b.name));
      return games;
    } catch (err) {
      // If not signed in or any other error, return empty array
      // User can sign in to load their games
      console.warn('Failed to list games:', err);
      return [];
    }
  };

  const createGame = async (name) => {
    const baseId = slugify(name) || `game-${Date.now()}`;
    const games = await listGames();
    const existing = new Set(games.map((game) => game.id));
    let id = baseId;
    let suffix = 1;
    while (existing.has(id)) {
      id = `${baseId}-${suffix++}`;
    }
    const now = toIsoNow();
    const meta = { id, name, createdAt: now, updatedAt: now };
    await writeGame(meta);
    const templateFileId = await resolveFileId("template", id);
    if (!templateFileId) {
      const gameFolderId = await ensureGameFolder(id);
      const createdId = await createFile({
        name: "template.json",
        content: defaultTemplate(),
        appProperties: {
          app: appTag,
          type: "template",
          gameId: id
        },
        parentId: gameFolderId
      });
      cacheFile("template", id, "", createdId);
    }
    return meta;
  };

  const updateGame = async (gameId, updates) => {
    const meta = await readGame(gameId);
    if (!meta) throw new Error("Game not found.");
    const next = { ...meta, ...updates, updatedAt: toIsoNow() };
    await writeGame(next);
    return next;
  };

  const deleteGame = async (gameId) => {
    // Delete all files with gameId appProperty (for backward compatibility)
    const files = await listFiles({ gameId });
    for (const file of files) {
      await deleteFile(file.id);
    }
    
    // Delete the game folder if it exists
    const gameFolderId = folderCache.get(`game:${gameId}`);
    if (gameFolderId) {
      await deleteFile(gameFolderId);
      folderCache.delete(`game:${gameId}`);
      folderCache.delete(`cards:${gameId}`);
    }
    
    fileCache.forEach((value, key) => {
      if (key.includes(`:${gameId}:`)) fileCache.delete(key);
    });
    gameCache.delete(gameId);
  };

  const listCards = async (gameId) => {
    const cards = [];
    const seenCardIds = new Set();
    
    // Try to get cards from the cards folder (new structure)
    const cardsFolderId = folderCache.get(`cards:${gameId}`);
    if (cardsFolderId) {
      const files = await listFilesInFolder(cardsFolderId);
      for (const file of files) {
        const card = normalizeCard(await getFileContent(file.id));
        cards.push(card);
        seenCardIds.add(card.id);
        cacheFile("card", gameId, card.id, file.id);
      }
    } else {
      // Check if the game folder exists
      const gameFolderId = folderCache.get(`game:${gameId}`);
      if (gameFolderId) {
        // Try to find cards folder
        const folders = await listFoldersInParent(gameFolderId);
        const cardsFolder = folders.find((f) => f.name === "cards");
        if (cardsFolder) {
          folderCache.set(`cards:${gameId}`, cardsFolder.id);
          const files = await listFilesInFolder(cardsFolder.id);
          for (const file of files) {
            const card = normalizeCard(await getFileContent(file.id));
            cards.push(card);
            seenCardIds.add(card.id);
            cacheFile("card", gameId, card.id, file.id);
          }
        }
      }
    }
    
    // Also check for legacy flat structure cards (backward compatibility)
    const legacyFiles = await listFiles({ type: "card", gameId });
    for (const file of legacyFiles) {
      const card = normalizeCard(await getFileContent(file.id));
      if (!seenCardIds.has(card.id)) {
        cards.push(card);
        seenCardIds.add(card.id);
        cacheFile("card", gameId, card.id, file.id);
      }
    }
    
    cards.sort((a, b) => a.name.localeCompare(b.name));
    return cards;
  };

  const saveCard = async (gameId, cardId, payload) => {
    const cards = await listCards(gameId);
    const existing = new Set(cards.map((card) => card.id));
    let id = cardId || slugify(payload.name || "card");
    if (!cardId) {
      let suffix = 1;
      while (existing.has(id)) {
        id = `${slugify(payload.name || "card")}-${suffix++}`;
      }
    }
    const normalized = normalizeCard({ ...payload, id });
    const fileId = await resolveFileId("card", gameId, id);
    if (fileId) {
      await updateFileContent(fileId, normalized);
      cacheFile("card", gameId, id, fileId);
    } else {
      const cardsFolderId = await ensureCardsFolder(gameId);
      const createdId = await createFile({
        name: `${id}.json`,
        content: normalized,
        appProperties: {
          app: appTag,
          type: "card",
          gameId,
          cardId: id
        },
        parentId: cardsFolderId
      });
      cacheFile("card", gameId, id, createdId);
    }
    await touchGame(gameId);
    return normalized;
  };

  const deleteCard = async (gameId, cardId) => {
    const fileId = await resolveFileId("card", gameId, cardId);
    if (fileId) {
      await deleteFile(fileId);
      fileCache.delete(fileKey("card", gameId, cardId));
      await touchGame(gameId);
    }
  };

  const loadTemplate = async (gameId) => {
    const fileId = await resolveFileId("template", gameId);
    if (!fileId) {
      const content = defaultTemplate();
      const gameFolderId = await ensureGameFolder(gameId);
      const createdId = await createFile({
        name: "template.json",
        content,
        appProperties: {
          app: appTag,
          type: "template",
          gameId
        },
        parentId: gameFolderId
      });
      cacheFile("template", gameId, "", createdId);
      return content;
    }
    const raw = await getFileContent(fileId);
    // Normalize template to handle empty/invalid values
    return normalizeTemplate(raw);
  };

  const saveTemplate = async (gameId, template) => {
    const fileId = await resolveFileId("template", gameId);
    if (fileId) {
      await updateFileContent(fileId, template);
    } else {
      const gameFolderId = await ensureGameFolder(gameId);
      const createdId = await createFile({
        name: "template.json",
        content: template,
        appProperties: {
          app: appTag,
          type: "template",
          gameId
        },
        parentId: gameFolderId
      });
      cacheFile("template", gameId, "", createdId);
    }
    await touchGame(gameId);
    return template;
  };

  const getGame = async (gameId) => {
    const meta = await readGame(gameId);
    if (!meta) throw new Error("Game not found.");
    return meta;
  };

  return {
    init,
    signIn,
    signOut,
    tryRestoreSession,
    isAuthorized,
    listGames,
    createGame,
    updateGame,
    deleteGame,
    listCards,
    saveCard,
    deleteCard,
    loadTemplate,
    saveTemplate,
    getGame
  };
};
