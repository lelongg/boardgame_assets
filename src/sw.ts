/// <reference lib="webworker" />
// eslint-disable-next-line no-restricted-globals
const sw = self as unknown as ServiceWorkerGlobalScope;

const ASSET_PATTERN = /^\/api\/games\/[^/]+\/(fonts|images)\/[^/]+$/;

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

function getAsset(
  urlPath: string
): Promise<{ blob: Blob; mimeType: string } | undefined> {
  return openDB().then(
    (db) =>
      new Promise((resolve, reject) => {
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
      })
  );
}

sw.addEventListener("install", () => {
  sw.skipWaiting();
});

sw.addEventListener("activate", (event) => {
  event.waitUntil(sw.clients.claim());
});

sw.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (!ASSET_PATTERN.test(url.pathname)) {
    return;
  }

  event.respondWith(
    getAsset(url.pathname).then((record) => {
      if (record) {
        return new Response(record.blob, {
          status: 200,
          headers: {
            "Content-Type": record.mimeType,
          },
        });
      }
      return fetch(event.request);
    })
  );
});
