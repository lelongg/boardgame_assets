import type { CardLayout } from "../types";
import type { StorageBackend } from "./backend";

export interface IndexedDBStorageOptions {
  defaultLayout?: () => CardLayout;
  [key: string]: any;
}

export function createIndexedDBStorage(options?: IndexedDBStorageOptions): StorageBackend;
