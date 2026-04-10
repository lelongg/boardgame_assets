import type { CardLayout } from "../types";

export interface StorageOptions {
  defaultLayout?: () => CardLayout;
  [key: string]: any;
}

export interface Storage {
  init?: () => Promise<void>;
  tryRestoreSession?: () => Promise<void>;
  [key: string]: any;
}

export function createLocalFileStorage(options?: StorageOptions): Storage;
