import type { CardLayout } from "../types";

export interface IndexedDBStorageOptions {
  defaultLayout?: () => CardLayout;
  [key: string]: any;
}

export interface Storage {
  init?: () => Promise<void>;
  tryRestoreSession?: () => Promise<void>;
  [key: string]: any;
}

export function createIndexedDBStorage(options?: IndexedDBStorageOptions): Storage;
