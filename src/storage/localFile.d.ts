import type { CardLayout } from "../types";
import type { StorageBackend } from "./backend";

export interface StorageOptions {
  defaultLayout?: () => CardLayout;
  [key: string]: any;
}

export function createLocalFileStorage(options?: StorageOptions): StorageBackend;
