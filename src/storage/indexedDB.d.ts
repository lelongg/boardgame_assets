import type { CardTemplate } from "../types";

export interface IndexedDBStorageOptions {
  defaultTemplate?: () => CardTemplate;
  [key: string]: any;
}

export interface Storage {
  init?: () => Promise<void>;
  tryRestoreSession?: () => Promise<void>;
  [key: string]: any;
}

export function createIndexedDBStorage(options?: IndexedDBStorageOptions): Storage;
