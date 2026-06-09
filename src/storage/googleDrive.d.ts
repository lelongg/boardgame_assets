import type { CardLayout } from "../types";
import type { StorageBackend } from "./backend";

export interface StorageOptions {
  clientId?: string;
  appTag?: string;
  folderId?: string;
  defaultLayout?: () => CardLayout;
}

export function createGoogleDriveStorage(options?: StorageOptions): StorageBackend;
