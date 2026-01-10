import { config } from "./config.js";
import { defaultTemplate } from "./template.js";
import { createGoogleDriveStorage } from "./storage/googleDrive.js";

const providers = {
  googleDrive: createGoogleDriveStorage
};

export const createStorage = () => {
  const providerKey = config?.storage?.provider ?? "googleDrive";
  const factory = providers[providerKey];
  if (!factory) {
    throw new Error(`Unknown storage provider: ${providerKey}`);
  }
  const providerConfig = config?.storage?.[providerKey] ?? {};
  return factory({ ...providerConfig, defaultTemplate });
};
