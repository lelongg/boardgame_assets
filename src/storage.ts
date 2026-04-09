import { config } from "./config";
import { defaultTemplate } from "./template";
import { createGoogleDriveStorage } from "./storage/googleDrive";
import { createLocalFileStorage } from "./storage/localFile";
import { createIndexedDBStorage } from "./storage/indexedDB";

const providers: Record<string, Function> = {
  googleDrive: createGoogleDriveStorage,
  localFile: createLocalFileStorage,
  indexedDB: createIndexedDBStorage,
};

const PROVIDER_KEY = "boardgame_assets_provider";

export const getProvider = (): string =>
  localStorage.getItem(PROVIDER_KEY) ?? "localFile";

export const setProvider = (provider: string) =>
  localStorage.setItem(PROVIDER_KEY, provider);

export const createStorage = async () => {
  const providerKey = getProvider();
  const factory = providers[providerKey];
  if (!factory) {
    throw new Error(`Unknown storage provider: ${providerKey}`);
  }
  const providerConfig = (config?.storage as Record<string, unknown>)?.[providerKey] ?? {};
  const storage = factory({ ...providerConfig, defaultTemplate });

  if (storage.init) {
    await storage.init();
  }

  if (storage.tryRestoreSession) {
    await storage.tryRestoreSession();
  }

  return storage;
};
