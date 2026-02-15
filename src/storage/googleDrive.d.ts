import type { CardTemplate } from "../types";

export interface StorageOptions {
  clientId?: string;
  appTag?: string;
  folderId?: string;
  defaultTemplate?: () => CardTemplate;
}

export interface Storage {
  init?: () => Promise<void>;
  tryRestoreSession?: () => Promise<void>;
  [key: string]: any;
}

export function createGoogleDriveStorage(options?: StorageOptions): Storage;
