import { config } from "./config";
import { defaultTemplate } from "./template";
import { createGoogleDriveStorage } from "./storage/googleDrive";
import { createLocalFileStorage } from "./storage/localFile";

const providers = {
  googleDrive: createGoogleDriveStorage,
  localFile: createLocalFileStorage
};

// Detect if we're running in local development mode (server provides /api endpoints)
const isLocalDev = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";

export const createStorage = async () => {
  // Override provider to localFile if in dev mode
  const providerKey = isLocalDev ? "localFile" : (config?.storage?.provider ?? "googleDrive");
  const factory = providers[providerKey];
  if (!factory) {
    throw new Error(`Unknown storage provider: ${providerKey}`);
  }
  const providerConfig = config?.storage?.[providerKey] ?? {};
  const storage = factory({ ...providerConfig, defaultTemplate });
  
  // Initialize the storage provider
  if (storage.init) {
    await storage.init();
  }
  
  // Try to restore session (for Google Drive)
  if (storage.tryRestoreSession) {
    await storage.tryRestoreSession();
  }
  
  return storage;
};
