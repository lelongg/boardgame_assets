import { classicDeckCards, classicDeckLayout } from "./data/classicDeck";

const CLASSIC_DECK_NAME = "Classic Card Deck";

/**
 * Ensure the classic 52-card deck + 2 jokers exists with the correct layout.
 * Creates it if not found, or re-seeds the layout if it's stale.
 */
export const seedIfEmpty = async (storage: any): Promise<void> => {
  const games = await storage.listGames();
  const existing = games.find((g: any) => g.name === CLASSIC_DECK_NAME);

  if (existing) {
    // Verify the layout has the playing card items (not the generic default)
    const layout = await storage.getLayout(existing.id, "default").catch(() => null);
    const hasBindingValues = layout?.bindingMeta?.["defaultValue:rank"]?.values?.length;
    if (hasBindingValues) return;
    // Stale layout -- re-seed it
    await storage.saveLayout(existing.id, "default", classicDeckLayout());
    return;
  }

  const game = await storage.createGame(CLASSIC_DECK_NAME);
  await storage.saveLayout(game.id, "default", classicDeckLayout());

  const cards = classicDeckCards();
  for (const card of cards) {
    await storage.saveCard(game.id, "default", card.id, card);
  }
};
