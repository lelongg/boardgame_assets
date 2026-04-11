/**
 * Local file storage using the development server API.
 * This storage provider talks to the server API endpoints.
 */

const apiBase = "/api";

export const createLocalFileStorage = ({ defaultLayout }) => {
  return {
    async init() {},
    async tryRestoreSession() { return true; },
    isAuthorized() { return true; },
    async signIn() {},
    async signOut() {},

    // Games
    async listGames() {
      const response = await fetch(`${apiBase}/games`);
      if (!response.ok) throw new Error("Failed to list games");
      return await response.json();
    },

    async getGame(gameId) {
      const response = await fetch(`${apiBase}/games/${gameId}`);
      if (!response.ok) throw new Error("Failed to get game");
      return await response.json();
    },

    async createGame(name) {
      const response = await fetch(`${apiBase}/games`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name })
      });
      if (!response.ok) throw new Error("Failed to create game");
      return await response.json();
    },

    async updateGame(gameId, updates) {
      const response = await fetch(`${apiBase}/games/${gameId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates)
      });
      if (!response.ok) throw new Error("Failed to update game");
      return await response.json();
    },

    async deleteGame(gameId) {
      const response = await fetch(`${apiBase}/games/${gameId}`, { method: "DELETE" });
      if (!response.ok) throw new Error("Failed to delete game");
    },

    // Layouts
    async listLayouts(gameId) {
      const response = await fetch(`${apiBase}/games/${gameId}/layouts`);
      if (!response.ok) throw new Error("Failed to list layouts");
      return await response.json();
    },

    async getLayout(gameId, layoutId) {
      const response = await fetch(`${apiBase}/games/${gameId}/layouts/${layoutId}`);
      if (!response.ok) throw new Error("Failed to get layout");
      return await response.json();
    },

    async saveLayout(gameId, layoutId, layout) {
      const response = await fetch(`${apiBase}/games/${gameId}/layouts/${layoutId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(layout)
      });
      if (!response.ok) throw new Error("Failed to save layout");
      return await response.json();
    },

    async createLayout(gameId, name) {
      const response = await fetch(`${apiBase}/games/${gameId}/layouts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name })
      });
      if (!response.ok) throw new Error("Failed to create layout");
      return await response.json();
    },

    async copyLayout(gameId, layoutId) {
      const response = await fetch(`${apiBase}/games/${gameId}/layouts/${layoutId}/copy`, { method: "POST" });
      if (!response.ok) throw new Error("Failed to copy layout");
      return await response.json();
    },

    async deleteLayout(gameId, layoutId) {
      const response = await fetch(`${apiBase}/games/${gameId}/layouts/${layoutId}`, { method: "DELETE" });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.error || "Failed to delete layout");
      }
    },

    // Collections
    async listCollections(gameId) {
      const response = await fetch(`${apiBase}/games/${gameId}/collections`);
      if (!response.ok) throw new Error("Failed to list collections");
      return await response.json();
    },

    async getCollection(gameId, collectionId) {
      const response = await fetch(`${apiBase}/games/${gameId}/collections/${collectionId}`);
      if (!response.ok) throw new Error("Failed to get collection");
      return await response.json();
    },

    async createCollection(gameId, name, layoutId) {
      const response = await fetch(`${apiBase}/games/${gameId}/collections`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, layoutId })
      });
      if (!response.ok) throw new Error("Failed to create collection");
      return await response.json();
    },

    async updateCollection(gameId, collectionId, updates) {
      const response = await fetch(`${apiBase}/games/${gameId}/collections/${collectionId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates)
      });
      if (!response.ok) throw new Error("Failed to update collection");
      return await response.json();
    },

    async deleteCollection(gameId, collectionId) {
      const response = await fetch(`${apiBase}/games/${gameId}/collections/${collectionId}`, { method: "DELETE" });
      if (!response.ok) throw new Error("Failed to delete collection");
    },

    // Cards (within collections)
    async listCards(gameId, collectionId) {
      const response = await fetch(`${apiBase}/games/${gameId}/collections/${collectionId}/cards`);
      if (!response.ok) throw new Error("Failed to list cards");
      return await response.json();
    },

    async getCard(gameId, collectionId, cardId) {
      const response = await fetch(`${apiBase}/games/${gameId}/collections/${collectionId}/cards/${cardId}`);
      if (!response.ok) throw new Error("Failed to get card");
      return await response.json();
    },

    async saveCard(gameId, collectionId, cardId, card) {
      if (cardId) {
        const response = await fetch(`${apiBase}/games/${gameId}/collections/${collectionId}/cards/${cardId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(card)
        });
        if (!response.ok) throw new Error("Failed to update card");
        return await response.json();
      } else {
        const response = await fetch(`${apiBase}/games/${gameId}/collections/${collectionId}/cards`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(card)
        });
        if (!response.ok) throw new Error("Failed to create card");
        return await response.json();
      }
    },

    async copyCard(gameId, collectionId, cardId) {
      const response = await fetch(`${apiBase}/games/${gameId}/collections/${collectionId}/cards/${cardId}/copy`, { method: "POST" });
      if (!response.ok) throw new Error("Failed to copy card");
      return await response.json();
    },

    async deleteCard(gameId, collectionId, cardId) {
      const response = await fetch(`${apiBase}/games/${gameId}/collections/${collectionId}/cards/${cardId}`, {
        method: "DELETE"
      });
      if (!response.ok) throw new Error("Failed to delete card");
    },

    // Fonts (per-game)
    async listFonts(gameId) {
      const response = await fetch(`${apiBase}/games/${gameId}/fonts`);
      if (!response.ok) throw new Error("Failed to list fonts");
      return await response.json();
    },

    async addGoogleFont(gameId, name, slotName) {
      const response = await fetch(`${apiBase}/games/${gameId}/fonts/google`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, slotName })
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.error || "Failed to add font");
      }
      return await response.json();
    },

    async uploadFont(gameId, file, slotName) {
      const response = await fetch(`${apiBase}/games/${gameId}/fonts/upload`, {
        method: "POST",
        headers: {
          "Content-Disposition": `attachment; filename="${file.name}"`,
          "X-Slot-Name": slotName || "",
        },
        body: await file.arrayBuffer()
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.error || "Failed to upload font");
      }
      return await response.json();
    },

    async deleteFont(gameId, file) {
      const response = await fetch(`${apiBase}/games/${gameId}/fonts/${file}`, { method: "DELETE" });
      if (!response.ok) throw new Error("Failed to delete font");
      return await response.json();
    },

    // Images
    async listImages(gameId) {
      const response = await fetch(`${apiBase}/games/${gameId}/images`);
      if (!response.ok) throw new Error("Failed to list images");
      return await response.json();
    },

    async uploadImage(gameId, file) {
      const response = await fetch(`${apiBase}/games/${gameId}/images/upload`, {
        method: "POST",
        headers: { "Content-Disposition": `attachment; filename="${file.name}"` },
        body: await file.arrayBuffer(),
      });
      if (!response.ok) throw new Error("Failed to upload image");
      const data = await response.json();
      return data.url;
    },

    async deleteImage(gameId, file) {
      const response = await fetch(`${apiBase}/games/${gameId}/images/${file}`, { method: "DELETE" });
      if (!response.ok) throw new Error("Failed to delete image");
    }
  };
};
