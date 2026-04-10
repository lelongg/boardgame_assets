import type { CardLayout } from "../types";

export interface StorageOptions {
  clientId?: string;
  appTag?: string;
  folderId?: string;
  defaultLayout?: () => CardLayout;
}

export interface Storage {
  init?: () => Promise<void>;
  tryRestoreSession?: () => Promise<void>;
  [key: string]: any;
}

export function createGoogleDriveStorage(options?: StorageOptions): Storage;
