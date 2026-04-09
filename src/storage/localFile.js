/**
 * Local file storage using the development server API.
 * This storage provider talks to the server API endpoints.
 */

const apiBase = "/api";

export const createLocalFileStorage = ({ defaultTemplate }) => {
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

    // Templates
    async listTemplates(gameId) {
      const response = await fetch(`${apiBase}/games/${gameId}/templates`);
      if (!response.ok) throw new Error("Failed to list templates");
      return await response.json();
    },

    async getTemplate(gameId, templateId) {
      const response = await fetch(`${apiBase}/games/${gameId}/templates/${templateId}`);
      if (!response.ok) throw new Error("Failed to get template");
      return await response.json();
    },

    async saveTemplate(gameId, templateId, template) {
      const response = await fetch(`${apiBase}/games/${gameId}/templates/${templateId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(template)
      });
      if (!response.ok) throw new Error("Failed to save template");
      return await response.json();
    },

    async createTemplate(gameId, name) {
      const response = await fetch(`${apiBase}/games/${gameId}/templates`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name })
      });
      if (!response.ok) throw new Error("Failed to create template");
      return await response.json();
    },

    async copyTemplate(gameId, templateId) {
      const response = await fetch(`${apiBase}/games/${gameId}/templates/${templateId}/copy`, { method: "POST" });
      if (!response.ok) throw new Error("Failed to copy template");
      return await response.json();
    },

    async deleteTemplate(gameId, templateId) {
      const response = await fetch(`${apiBase}/games/${gameId}/templates/${templateId}`, { method: "DELETE" });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.error || "Failed to delete template");
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

    async createCollection(gameId, name, templateId) {
      const response = await fetch(`${apiBase}/games/${gameId}/collections`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, templateId })
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

    // Fonts (global)
    async listFonts() {
      const response = await fetch(`${apiBase}/fonts`);
      if (!response.ok) throw new Error("Failed to list fonts");
      return await response.json();
    },

    async addGoogleFont(name, slotName) {
      const response = await fetch(`${apiBase}/fonts/google`, {
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

    async uploadFont(file, slotName) {
      const response = await fetch(`${apiBase}/fonts/upload`, {
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

    async deleteFont(file) {
      const response = await fetch(`${apiBase}/fonts/${file}`, { method: "DELETE" });
      if (!response.ok) throw new Error("Failed to delete font");
      return await response.json();
    }
  };
};
