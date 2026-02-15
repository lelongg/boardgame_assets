import type { CardTemplate } from "../types";

export interface StorageOptions {
  defaultTemplate?: () => CardTemplate;
  [key: string]: any;
}

export interface Storage {
  init?: () => Promise<void>;
  tryRestoreSession?: () => Promise<void>;
  [key: string]: any;
}

export function createLocalFileStorage(options?: StorageOptions): Storage;
