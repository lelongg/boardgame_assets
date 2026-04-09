const DB_NAME = "boardgame-assets";
const DB_VERSION = 2;
const STORE_NAME = "assets";

interface AssetRecord {
  blob: Blob;
  mimeType: string;
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };

    request.onsuccess = (event) => {
      resolve((event.target as IDBOpenDBRequest).result);
    };

    request.onerror = (event) => {
      reject((event.target as IDBOpenDBRequest).error);
    };
  });
}

export async function putAsset(
  urlPath: string,
  blob: Blob,
  mimeType: string
): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const record: AssetRecord = { blob, mimeType };
    const request = store.put(record, urlPath);

    request.onsuccess = () => {
      db.close();
      resolve();
    };

    request.onerror = (event) => {
      db.close();
      reject((event.target as IDBRequest).error);
    };
  });
}

export async function getAsset(
  urlPath: string
): Promise<{ blob: Blob; mimeType: string } | undefined> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const request = store.get(urlPath);

    request.onsuccess = (event) => {
      db.close();
      const result = (event.target as IDBRequest<AssetRecord | undefined>)
        .result;
      resolve(result);
    };

    request.onerror = (event) => {
      db.close();
      reject((event.target as IDBRequest).error);
    };
  });
}

export async function deleteAsset(urlPath: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const request = store.delete(urlPath);

    request.onsuccess = () => {
      db.close();
      resolve();
    };

    request.onerror = (event) => {
      db.close();
      reject((event.target as IDBRequest).error);
    };
  });
}

export async function listAssets(prefix: string): Promise<string[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const request = store.getAllKeys();

    request.onsuccess = (event) => {
      db.close();
      const keys = (event.target as IDBRequest<IDBValidKey[]>).result;
      const filtered = keys
        .filter((key): key is string => typeof key === "string")
        .filter((key) => key.startsWith(prefix));
      resolve(filtered);
    };

    request.onerror = (event) => {
      db.close();
      reject((event.target as IDBRequest).error);
    };
  });
}
