import type { CardLayout } from "../types";
import type { StorageBackend } from "./backend";

export interface S3StorageOptions {
  defaultLayout?: () => CardLayout;
  bucket?: string;
  region?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  endpoint?: string;
  prefix?: string;
  [key: string]: any;
}

export function createS3Storage(options?: S3StorageOptions): StorageBackend;
