import { HardDrive, Database, Cloud, Server, type LucideIcon } from "lucide-react";
import { config } from "./config";
import { defaultLayout } from "./layout";
import { createGoogleDriveStorage } from "./storage/googleDrive";
import { createLocalFileStorage } from "./storage/localFile";
import { createIndexedDBStorage } from "./storage/indexedDB";
import { createS3Storage } from "./storage/s3";

export const BACKENDS = [
  { key: 'localFile', name: 'Local Disk', description: 'Requires the dev server running', icon: HardDrive },
  { key: 'indexedDB', name: 'Browser Storage', description: 'Stored in this browser, works offline', icon: Database },
  { key: 'googleDrive', name: 'Google Drive', description: 'Stored in your Google Drive', icon: Cloud },
  { key: 's3', name: 'S3 Storage', description: 'AWS S3 or compatible (MinIO, R2, B2)', icon: Server },
] as const satisfies readonly { key: string; name: string; description: string; icon: LucideIcon }[];

export type BackendKey = (typeof BACKENDS)[number]['key'];

const providers: Record<string, Function> = {
  googleDrive: createGoogleDriveStorage,
  localFile: createLocalFileStorage,
  indexedDB: createIndexedDBStorage,
  s3: createS3Storage,
};

const PROVIDER_KEY = "boardgame_assets_provider";

export const getProvider = (): string =>
  localStorage.getItem(PROVIDER_KEY) ?? "localFile";

export const setProvider = (provider: string) =>
  localStorage.setItem(PROVIDER_KEY, provider);

export const createStorageFor = async (providerKey: string) => {
  const factory = providers[providerKey];
  if (!factory) {
    throw new Error(`Unknown storage provider: ${providerKey}`);
  }
  let providerConfig = (config?.storage as Record<string, unknown>)?.[providerKey] ?? {};
  // S3 config is stored in localStorage
  if (providerKey === 's3') {
    try { providerConfig = JSON.parse(localStorage.getItem('boardgame_assets_s3_config') ?? '{}'); } catch { /* skip */ }
  }
  const storage = factory({ ...providerConfig, defaultLayout });

  if (storage.init) {
    await storage.init();
  }

  if (storage.tryRestoreSession) {
    await storage.tryRestoreSession();
  }

  return storage;
};

export const createStorage = async () => createStorageFor(getProvider());
