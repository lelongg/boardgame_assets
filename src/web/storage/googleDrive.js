const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.file";
const DRIVE_API = "https://www.googleapis.com/drive/v3";
const DRIVE_UPLOAD = "https://www.googleapis.com/upload/drive/v3";

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

const escapeQueryValue = (value) => String(value).replace(/'/g, "\\'");

const toIsoNow = () => new Date().toISOString();

const normalizeCard = (card) => {
  const fields =
    card && typeof card.fields === "object" && card.fields !== null ? card.fields : {};
  return {
    id: String(card?.id ?? slugify(card?.name ?? "card")),
    name: String(card?.name ?? "New Card"),
    fields: Object.fromEntries(
      Object.entries(fields).map(([key, value]) => [key, String(value ?? "")])
    )
  };
};

export const createGoogleDriveStorage = (options = {}) => {
  const clientId = options.clientId ?? "";
  const appTag = options.appTag ?? "boardgame-assets";
  const folderId = options.folderId ? String(options.folderId) : "";
  const defaultTemplate = options.defaultTemplate;

  if (!clientId || clientId.includes("YOUR_GOOGLE_CLIENT_ID")) {
    throw new Error("Missing Google OAuth client ID in src/web/config.js.");
  }
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

  const saveTokenToStorage = () => {
    try {
      if (accessToken && typeof tokenExpiry === "number") {
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
        if (typeof token === "string" && typeof expiry === "number") {
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
    await init();
    await requestToken("consent");
  };

  const tryRestoreSession = async () => {
    await init();
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
  };

  const getAccessToken = async () => {
    await init();
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

  const getFileContent = async (fileId) => {
    const url = `${DRIVE_API}/files/${fileId}?alt=media`;
    const response = await driveFetch(url);
    return response.json();
  };

  const createFile = async ({ name, content, appProperties }) => {
    const boundary = `boundary-${Math.random().toString(16).slice(2)}`;
    const metadata = {
      name,
      mimeType: "application/json",
      appProperties,
      ...(folderId ? { parents: [folderId] } : {})
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

  const fileKey = (type, gameId, cardId = "") => `${type}:${gameId}:${cardId}`;

  const cacheFile = (type, gameId, cardId, fileId) => {
    fileCache.set(fileKey(type, gameId, cardId), fileId);
  };

  const getCachedFile = (type, gameId, cardId) => fileCache.get(fileKey(type, gameId, cardId));

  const resolveFileId = async (type, gameId, cardId) => {
    const cached = getCachedFile(type, gameId, cardId);
    if (cached) return cached;
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
    const createdId = await createFile({
      name: `game-${gameId}.json`,
      content: meta,
      appProperties: {
        app: appTag,
        type: "game",
        gameId
      }
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
    const files = await listFiles({ type: "game" });
    const games = [];
    for (const file of files) {
      const meta = await getFileContent(file.id);
      if (meta?.id) {
        games.push(meta);
        cacheFile("game", meta.id, "", file.id);
        gameCache.set(meta.id, { fileId: file.id, meta });
      }
    }
    games.sort((a, b) => a.name.localeCompare(b.name));
    return games;
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
      const createdId = await createFile({
        name: `template-${id}.json`,
        content: defaultTemplate(),
        appProperties: {
          app: appTag,
          type: "template",
          gameId: id
        }
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
    const files = await listFiles({ gameId });
    for (const file of files) {
      await deleteFile(file.id);
    }
    fileCache.forEach((value, key) => {
      if (key.includes(`:${gameId}:`)) fileCache.delete(key);
    });
    gameCache.delete(gameId);
  };

  const listCards = async (gameId) => {
    const files = await listFiles({ type: "card", gameId });
    const cards = [];
    for (const file of files) {
      const card = normalizeCard(await getFileContent(file.id));
      cards.push(card);
      cacheFile("card", gameId, card.id, file.id);
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
      const createdId = await createFile({
        name: `card-${gameId}-${id}.json`,
        content: normalized,
        appProperties: {
          app: appTag,
          type: "card",
          gameId,
          cardId: id
        }
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
      const createdId = await createFile({
        name: `template-${gameId}.json`,
        content,
        appProperties: {
          app: appTag,
          type: "template",
          gameId
        }
      });
      cacheFile("template", gameId, "", createdId);
      return content;
    }
    return getFileContent(fileId);
  };

  const saveTemplate = async (gameId, template) => {
    const fileId = await resolveFileId("template", gameId);
    if (fileId) {
      await updateFileContent(fileId, template);
    } else {
      const createdId = await createFile({
        name: `template-${gameId}.json`,
        content: template,
        appProperties: {
          app: appTag,
          type: "template",
          gameId
        }
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
