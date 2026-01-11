/**
 * Local file storage using the development server API.
 * This storage provider talks to the server API endpoints.
 */

const apiBase = "/api";

export const createLocalFileStorage = ({ defaultTemplate }) => {
  return {
    async init() {
      // No initialization needed for local file storage
    },

    async tryRestoreSession() {
      // Always return true since local file storage doesn't require auth
      return true;
    },

    isAuthorized() {
      return true;
    },

    async signIn() {
      // No sign-in needed for local file storage
    },

    async signOut() {
      // No sign-out needed for local file storage
    },

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
      const response = await fetch(`${apiBase}/games/${gameId}`, {
        method: "DELETE"
      });
      if (!response.ok) throw new Error("Failed to delete game");
    },

    async loadTemplate(gameId) {
      const response = await fetch(`${apiBase}/games/${gameId}/template`);
      if (!response.ok) throw new Error("Failed to load template");
      return await response.json();
    },

    async save(gameId, template) {
      const response = await fetch(`${apiBase}/games/${gameId}/template`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(template)
      });
      if (!response.ok) throw new Error("Failed to save template");
      return await response.json();
    },

    async listCards(gameId) {
      const response = await fetch(`${apiBase}/games/${gameId}/cards`);
      if (!response.ok) throw new Error("Failed to list cards");
      return await response.json();
    },

    async getCard(gameId, cardId) {
      const response = await fetch(`${apiBase}/games/${gameId}/cards/${cardId}`);
      if (!response.ok) throw new Error("Failed to get card");
      return await response.json();
    },

    async saveCard(gameId, cardId, card) {
      if (cardId) {
        const response = await fetch(`${apiBase}/games/${gameId}/cards/${cardId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(card)
        });
        if (!response.ok) throw new Error("Failed to update card");
        return await response.json();
      } else {
        const response = await fetch(`${apiBase}/games/${gameId}/cards`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(card)
        });
        if (!response.ok) throw new Error("Failed to create card");
        return await response.json();
      }
    },

    async deleteCard(gameId, cardId) {
      const response = await fetch(`${apiBase}/games/${gameId}/cards/${cardId}`, {
        method: "DELETE"
      });
      if (!response.ok) throw new Error("Failed to delete card");
    }
  };
};
