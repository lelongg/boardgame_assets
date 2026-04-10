import { classicDeckCards, classicDeckLayout } from "./data/classicDeck";

const CLASSIC_DECK_NAME = "Classic Card Deck";

/**
 * Ensure the classic 52-card deck + 2 jokers exists.
 * Creates it if not found. Works with any storage backend.
 */
export const seedIfEmpty = async (storage: any): Promise<void> => {
  const games = await storage.listGames();
  if (games.some((g: any) => g.name === CLASSIC_DECK_NAME)) return;

  const game = await storage.createGame(CLASSIC_DECK_NAME);

  // Replace the default layout with the playing card layout
  await storage.saveLayout(game.id, "default", classicDeckLayout());

  // Create all 54 cards in the default collection
  const cards = classicDeckCards();
  for (const card of cards) {
    await storage.saveCard(game.id, "default", card.id, card);
  }
};
