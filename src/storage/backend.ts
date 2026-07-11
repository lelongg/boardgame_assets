import type { CardData, CardLayout, Collection, FontSlot } from "../types";

export type GameMeta = {
  id: string;
  name: string;
  createdAt?: string;
  updatedAt?: string;
  // User-defined labels for filtering/sorting in lists
  tags?: string[];
  [key: string]: unknown;
};

export type ImageEntry = { file: string; url: string; name: string };

/** Card payload for saves — the id may be omitted when creating. */
export type CardInput = Omit<CardData, "id"> & { id?: string | null };

export type FontManifest = Record<string, FontSlot>;

export type CheckpointMeta = { id: string; name: string; createdAt: string };

/** A named, restorable snapshot of a collection's cards + metadata. */
export type Checkpoint = CheckpointMeta & {
  collection: { name: string; layoutId: string; backLayoutId?: string };
  cards: CardData[];
};

/** A named, restorable snapshot of a layout. */
export type LayoutCheckpoint = CheckpointMeta & {
  layout: CardLayout;
};

/**
 * The contract every storage backend (localFile, indexedDB, s3, googleDrive)
 * implements. The implementations are plain JS — this interface is what the
 * app compiles against, so a missing method or a divergent return shape on
 * one backend becomes a type error instead of a runtime surprise.
 *
 * Shared semantics the implementations must uphold:
 * - get*() throws when the entity does not exist (never fabricates defaults).
 * - update*() merges the given fields into the stored object; `id` is fixed.
 * - save*() normalizes (normalizeLayout/normalizeCard) and returns what was
 *   persisted.
 * - deleteLayout() throws if the layout is still referenced by a collection.
 * - clearCache() drops any backend-internal caches so the next read hits the
 *   underlying storage ("reload from storage" relies on this).
 */
export interface StorageBackend {
  init(): Promise<void>;
  tryRestoreSession(): Promise<boolean | void>;
  isAuthorized(): boolean;
  signIn(): Promise<void>;
  signOut(): Promise<void>;
  clearCache(): void | Promise<void>;

  listGames(): Promise<GameMeta[]>;
  getGame(gameId: string): Promise<GameMeta>;
  createGame(name: string): Promise<GameMeta>;
  updateGame(gameId: string, updates: Record<string, unknown>): Promise<GameMeta>;
  deleteGame(gameId: string): Promise<void>;

  listLayouts(gameId: string): Promise<CardLayout[]>;
  getLayout(gameId: string, layoutId: string): Promise<CardLayout>;
  saveLayout(gameId: string, layoutId: string, layout: CardLayout): Promise<CardLayout>;
  createLayout(gameId: string, name: string): Promise<CardLayout>;
  copyLayout(gameId: string, layoutId: string): Promise<CardLayout>;
  deleteLayout(gameId: string, layoutId: string): Promise<void>;

  listCollections(gameId: string): Promise<Collection[]>;
  getCollection(gameId: string, collectionId: string): Promise<Collection>;
  createCollection(gameId: string, name: string, layoutId: string): Promise<Collection>;
  updateCollection(gameId: string, collectionId: string, updates: Record<string, unknown>): Promise<Collection>;
  deleteCollection(gameId: string, collectionId: string): Promise<void>;

  listCards(gameId: string, collectionId: string): Promise<CardData[]>;
  getCard(gameId: string, collectionId: string, cardId: string): Promise<CardData>;
  /** A null/empty cardId creates a new card with a generated id. */
  saveCard(gameId: string, collectionId: string, cardId: string | null, card: CardInput): Promise<CardData>;
  copyCard(gameId: string, collectionId: string, cardId: string): Promise<CardData>;
  deleteCard(gameId: string, collectionId: string, cardId: string): Promise<void>;

  listFonts(gameId: string): Promise<FontManifest>;
  addGoogleFont(gameId: string, name: string, slotName?: string): Promise<{ fonts: FontManifest }>;
  uploadFont(gameId: string, file: File, slotName?: string): Promise<{ fonts: FontManifest }>;
  deleteFont(gameId: string, file: string): Promise<{ fonts: FontManifest }>;
  /** Change the display name of the font in the given manifest slot. Layouts
   * reference fonts by slot key, so renaming never breaks existing layouts. */
  renameFont(gameId: string, slot: string, newName: string): Promise<{ fonts: FontManifest }>;

  uploadImage(gameId: string, file: File): Promise<string>;
  listImages(gameId: string): Promise<ImageEntry[]>;
  deleteImage(gameId: string, file: string): Promise<void>;
  renameImage(gameId: string, file: string, newName: string): Promise<void>;

  // Named, restorable snapshots of a collection (its cards + metadata).
  // Each is stored as one self-contained document under the collection.
  listCheckpoints(gameId: string, collectionId: string): Promise<CheckpointMeta[]>;
  getCheckpoint(gameId: string, collectionId: string, checkpointId: string): Promise<Checkpoint>;
  createCheckpoint(gameId: string, collectionId: string, name: string): Promise<CheckpointMeta>;
  restoreCheckpoint(gameId: string, collectionId: string, checkpointId: string): Promise<void>;
  deleteCheckpoint(gameId: string, collectionId: string, checkpointId: string): Promise<void>;

  // Named, restorable snapshots of a layout. Restore replaces the layout's
  // content with the snapshot but keeps the current id and name (mirroring
  // how collection restore keeps the collection's id/name).
  listLayoutCheckpoints(gameId: string, layoutId: string): Promise<CheckpointMeta[]>;
  createLayoutCheckpoint(gameId: string, layoutId: string, name: string): Promise<CheckpointMeta>;
  restoreLayoutCheckpoint(gameId: string, layoutId: string, checkpointId: string): Promise<void>;
  deleteLayoutCheckpoint(gameId: string, layoutId: string, checkpointId: string): Promise<void>;
}
