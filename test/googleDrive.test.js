import assert from "node:assert/strict";
import { test, mock } from "node:test";

// Mock the Google Drive storage module
// Since it requires browser APIs, we need to mock those first
const createMockGoogleDrive = () => {
  // Mock browser APIs
  const mockLocalStorage = new Map();
  global.localStorage = {
    getItem: (key) => mockLocalStorage.get(key) || null,
    setItem: (key, value) => mockLocalStorage.set(key, value),
    removeItem: (key) => mockLocalStorage.delete(key),
  };

  global.document = {
    createElement: () => ({
      src: "",
      async: false,
      defer: false,
      onload: null,
      onerror: null,
    }),
    head: {
      appendChild: (script) => {
        // Simulate successful script load
        if (script.onload) setTimeout(script.onload, 0);
      },
    },
  };

  const mockTokenClient = {
    callback: null,
    requestAccessToken: ({ prompt }) => {
      // Simulate token callback
      if (mockTokenClient.callback) {
        setTimeout(() => {
          mockTokenClient.callback({
            access_token: "mock_access_token",
            expires_in: 3600,
          });
        }, 0);
      }
    },
  };

  global.window = {
    google: {
      accounts: {
        oauth2: {
          initTokenClient: ({ client_id, scope, callback }) => {
            mockTokenClient.callback = callback;
            return mockTokenClient;
          },
          revoke: (token, callback) => {
            if (callback) callback();
          },
        },
      },
    },
    location: {
      hostname: "example.com",
    },
  };

  // Mock fetch API
  const mockFetch = mock.fn(async (url, options = {}) => {
    // Simulate different API responses based on URL
    const method = options.method || "GET";
    
    // Create folder
    if (url.includes("/files?fields=id") && method === "POST") {
      return {
        ok: true,
        json: async () => ({ id: "new_folder_id" }),
      };
    }
    
    if (url.includes("/files?q=")) {
      return {
        ok: true,
        json: async () => ({ files: [] }),
      };
    }
    if (url.includes("/files/") && url.includes("alt=media")) {
      return {
        ok: true,
        json: async () => ({ id: "test", name: "Test" }),
      };
    }
    if (url.includes("/files?uploadType=multipart")) {
      return {
        ok: true,
        json: async () => ({ id: "new_file_id" }),
      };
    }
    if (url.includes("/files/") && options.method === "PATCH") {
      return {
        ok: true,
        json: async () => ({}),
      };
    }
    if (url.includes("/files/") && options.method === "DELETE") {
      return {
        ok: true,
      };
    }
    return {
      ok: false,
      status: 404,
      text: async () => "Not found",
    };
  });

  global.fetch = mockFetch;

  return { mockLocalStorage, mockTokenClient, mockFetch };
};

test("Google Drive storage initialization", async () => {
  const { mockLocalStorage } = createMockGoogleDrive();

  const { createGoogleDriveStorage } = await import(
    "../src/web/storage/googleDrive.js"
  );

  const defaultTemplate = () => ({
    version: 2,
    id: "default",
    name: "Default",
    width: 750,
    height: 1050,
    radius: 28,
    bleed: 18,
    root: {
      id: "root",
      name: "Root",
      layout: "stack",
      sizePct: 100,
      gap: 0,
      children: [],
      items: [],
    },
  });

  const storage = createGoogleDriveStorage({
    clientId: "test_client_id",
    appTag: "test-app",
    defaultTemplate,
  });

  assert.ok(storage, "Storage should be created");
  assert.equal(typeof storage.init, "function", "Should have init method");
  assert.equal(typeof storage.signIn, "function", "Should have signIn method");
  assert.equal(
    typeof storage.signOut,
    "function",
    "Should have signOut method"
  );
  assert.equal(
    typeof storage.listGames,
    "function",
    "Should have listGames method"
  );
  assert.equal(
    typeof storage.createGame,
    "function",
    "Should have createGame method"
  );
});

test("Google Drive storage initialization without client ID shows error on signIn", async () => {
  createMockGoogleDrive();

  const { createGoogleDriveStorage } = await import(
    "../src/web/storage/googleDrive.js"
  );

  const defaultTemplate = () => ({ id: "default" });

  // Storage creation should not throw
  const storage1 = createGoogleDriveStorage({
    clientId: "",
    defaultTemplate,
  });
  
  assert.ok(storage1, "Storage should be created without error");
  
  // Init should also not throw
  await storage1.init();
  
  // But signIn should throw a helpful error
  await assert.rejects(
    async () => await storage1.signIn(),
    /Google Drive is not configured/,
    "Should throw error when trying to sign in without client ID"
  );

  // Same for placeholder client ID
  const storage2 = createGoogleDriveStorage({
    clientId: "YOUR_GOOGLE_CLIENT_ID",
    defaultTemplate,
  });
  
  assert.ok(storage2, "Storage should be created with placeholder client ID");
  
  // Init should not throw
  await storage2.init();
  
  // But signIn should throw
  await assert.rejects(
    async () => await storage2.signIn(),
    /Google Drive is not configured/,
    "Should throw error when trying to sign in with placeholder client ID"
  );
});

test("Google Drive storage initialization without defaultTemplate throws error", async () => {
  createMockGoogleDrive();

  const { createGoogleDriveStorage } = await import(
    "../src/web/storage/googleDrive.js"
  );

  assert.throws(
    () =>
      createGoogleDriveStorage({
        clientId: "test_client_id",
      }),
    /Missing default template factory/
  );
});

test("Google Drive storage init loads Google script", async (t) => {
  createMockGoogleDrive();

  const { createGoogleDriveStorage } = await import(
    "../src/web/storage/googleDrive.js"
  );

  const defaultTemplate = () => ({ id: "default" });

  const storage = createGoogleDriveStorage({
    clientId: "test_client_id",
    defaultTemplate,
  });

  await storage.init();
  assert.ok(true, "Init should complete successfully");
});

test("Google Drive storage sign in requests token", async () => {
  const { mockTokenClient } = createMockGoogleDrive();

  const { createGoogleDriveStorage } = await import(
    "../src/web/storage/googleDrive.js"
  );

  const defaultTemplate = () => ({ id: "default" });

  const storage = createGoogleDriveStorage({
    clientId: "test_client_id",
    defaultTemplate,
  });

  await storage.init();
  await storage.signIn();

  assert.ok(storage.isAuthorized(), "Should be authorized after sign in");
});

test("Google Drive storage token storage and restoration", async () => {
  const { mockLocalStorage } = createMockGoogleDrive();

  const { createGoogleDriveStorage } = await import(
    "../src/web/storage/googleDrive.js"
  );

  const defaultTemplate = () => ({ id: "default" });

  const storage = createGoogleDriveStorage({
    clientId: "test_client_id",
    defaultTemplate,
  });

  await storage.init();
  await storage.signIn();

  // Check that token was saved to localStorage
  const tokenKey = "boardgame_assets_google_token";
  const stored = mockLocalStorage.get(tokenKey);
  assert.ok(stored, "Token should be saved to localStorage");

  const parsed = JSON.parse(stored);
  assert.equal(
    parsed.accessToken,
    "mock_access_token",
    "Access token should be saved"
  );
  assert.ok(parsed.tokenExpiry > Date.now(), "Token expiry should be in future");
});

test("Google Drive storage sign out clears token", async () => {
  const { mockLocalStorage } = createMockGoogleDrive();

  const { createGoogleDriveStorage } = await import(
    "../src/web/storage/googleDrive.js"
  );

  const defaultTemplate = () => ({ id: "default" });

  const storage = createGoogleDriveStorage({
    clientId: "test_client_id",
    defaultTemplate,
  });

  await storage.init();
  await storage.signIn();

  assert.ok(storage.isAuthorized(), "Should be authorized");

  await storage.signOut();

  assert.ok(!storage.isAuthorized(), "Should not be authorized after sign out");
  const tokenKey = "boardgame_assets_google_token";
  assert.ok(
    !mockLocalStorage.has(tokenKey),
    "Token should be removed from localStorage"
  );
});

test("Google Drive storage tryRestoreSession with valid token", async () => {
  const { mockLocalStorage } = createMockGoogleDrive();

  const { createGoogleDriveStorage } = await import(
    "../src/web/storage/googleDrive.js"
  );

  const defaultTemplate = () => ({ id: "default" });

  // Store a valid token
  const tokenKey = "boardgame_assets_google_token";
  mockLocalStorage.set(
    tokenKey,
    JSON.stringify({
      accessToken: "mock_access_token",
      tokenExpiry: Date.now() + 3600000, // 1 hour in future
    })
  );

  const storage = createGoogleDriveStorage({
    clientId: "test_client_id",
    defaultTemplate,
  });

  const restored = await storage.tryRestoreSession();
  assert.ok(restored, "Should restore session with valid token");
  assert.ok(storage.isAuthorized(), "Should be authorized after restoration");
});

test("Google Drive storage tryRestoreSession with expired token", async () => {
  const { mockLocalStorage } = createMockGoogleDrive();

  const { createGoogleDriveStorage } = await import(
    "../src/web/storage/googleDrive.js"
  );

  const defaultTemplate = () => ({ id: "default" });

  // Store an expired token
  const tokenKey = "boardgame_assets_google_token";
  mockLocalStorage.set(
    tokenKey,
    JSON.stringify({
      accessToken: "mock_access_token",
      tokenExpiry: Date.now() - 3600000, // 1 hour in past
    })
  );

  const storage = createGoogleDriveStorage({
    clientId: "test_client_id",
    defaultTemplate,
  });

  const restored = await storage.tryRestoreSession();
  assert.ok(restored, "Should attempt to restore session");
});

test("Google Drive storage slugify helper", async () => {
  const { mockFetch } = createMockGoogleDrive();

  // Track created files (games and templates)
  const createdFiles = [];

  // Override fetch to handle file operations
  mockFetch.mock.mockImplementation(async (url, options = {}) => {
    const method = options.method || "GET";
    
    // Create folder (POST to /files with fields=id)
    if (url.includes("/files?fields=id") && method === "POST") {
      const metadata = JSON.parse(options.body);
      if (metadata.mimeType === "application/vnd.google-apps.folder") {
        const folderId = `folder_${createdFiles.length + 1}`;
        createdFiles.push({
          fileId: folderId,
          name: metadata.name,
          mimeType: "application/vnd.google-apps.folder",
          appProperties: metadata.appProperties || {},
          type: metadata.appProperties?.type,
          isFolder: true,
        });
        return {
          ok: true,
          json: async () => ({ id: folderId }),
        };
      }
    }
    
    // List files
    if (url.includes("/files?q=")) {
      const query = decodeURIComponent(url.split("q=")[1].split("&")[0]);
      const filteredFiles = createdFiles.filter((file) => {
        // Filter folders
        if (query.includes("mimeType='application/vnd.google-apps.folder'")) {
          return file.isFolder === true;
        }
        // Filter files by type
        if (query.includes("type") && query.includes("game")) {
          return file.type === "game";
        }
        if (query.includes("type") && query.includes("template")) {
          return file.type === "template";
        }
        return true;
      });
      return {
        ok: true,
        json: async () => ({
          files: filteredFiles.map((f) => ({
            id: f.fileId,
            name: f.name,
            appProperties: f.appProperties,
          })),
        }),
      };
    }
    
    // Get file content
    if (url.includes("/files/") && url.includes("alt=media")) {
      const fileId = url.split("/files/")[1].split("?")[0];
      const file = createdFiles.find((f) => f.fileId === fileId);
      if (file) {
        return {
          ok: true,
          json: async () => file.content,
        };
      }
    }
    
    // Update file content (PATCH)
    if (url.includes("/files/") && method === "PATCH" && url.includes("uploadType=media")) {
      const fileId = url.split("/files/")[1].split("?")[0];
      const file = createdFiles.find((f) => f.fileId === fileId);
      if (file) {
        file.content = JSON.parse(options.body);
        return {
          ok: true,
        };
      }
    }
    
    // Create file
    if (url.includes("/files?uploadType=multipart")) {
      const fileId = `file_${createdFiles.length + 1}`;
      const body = options.body;
      
      // Parse multipart body to extract metadata and content
      const parts = body.split(/--boundary-[a-f0-9]+/);
      let metadata = null;
      let content = null;
      
      for (const part of parts) {
        if (part.includes("Content-Type: application/json")) {
          const jsonMatch = part.match(/\{[^]*?\}(?=\s*$)/m);
          if (jsonMatch) {
            try {
              const parsed = JSON.parse(jsonMatch[0]);
              if (parsed.appProperties) {
                metadata = parsed;
              } else {
                content = parsed;
              }
            } catch (e) {
              // Ignore parse errors
            }
          }
        }
      }
      
      if (metadata && content) {
        createdFiles.push({
          fileId,
          name: metadata.name,
          appProperties: metadata.appProperties,
          type: metadata.appProperties.type,
          content,
        });
        return {
          ok: true,
          json: async () => ({ id: fileId }),
        };
      }
    }
    
    return { ok: false, status: 404, text: async () => "Not found" };
  });

  const { createGoogleDriveStorage } = await import(
    "../src/web/storage/googleDrive.js"
  );

  const defaultTemplate = () => ({ 
    id: "default",
    version: 2,
    root: { id: "root", children: [], items: [] }
  });

  const storage = createGoogleDriveStorage({
    clientId: "test_client_id",
    defaultTemplate,
  });

  await storage.init();
  await storage.signIn();

  // Test game creation with various names to verify slugify
  const game1 = await storage.createGame("Test Game");
  assert.equal(game1.id, "test-game", "Should slugify game name");

  const game2 = await storage.createGame("Test Game");
  assert.equal(
    game2.id,
    "test-game-1",
    "Should add suffix for duplicate slugs"
  );

  const game3 = await storage.createGame("Test@#$%Game!!!");
  assert.ok(game3.id.startsWith("test-game"), "Should remove special characters");
});

test("Google Drive storage listGames", async () => {
  const { mockFetch } = createMockGoogleDrive();

  // Override fetch to return mock games
  mockFetch.mock.mockImplementation(async (url, options = {}) => {
    if (url.includes("/files?q=")) {
      return {
        ok: true,
        json: async () => ({
          files: [
            { id: "file1", name: "game-test.json", appProperties: {} },
          ],
        }),
      };
    }
    if (url.includes("/files/") && url.includes("alt=media")) {
      return {
        ok: true,
        json: async () => ({
          id: "test",
          name: "Test Game",
          createdAt: "2024-01-01",
          updatedAt: "2024-01-01",
        }),
      };
    }
    return { ok: false, status: 404, text: async () => "Not found" };
  });

  const { createGoogleDriveStorage } = await import(
    "../src/web/storage/googleDrive.js"
  );

  const defaultTemplate = () => ({ id: "default" });

  const storage = createGoogleDriveStorage({
    clientId: "test_client_id",
    defaultTemplate,
  });

  await storage.init();
  await storage.signIn();

  const games = await storage.listGames();
  assert.ok(Array.isArray(games), "Should return array of games");
});

test("Google Drive storage fetch error handling", async () => {
  const { mockFetch } = createMockGoogleDrive();

  // Override fetch to return error
  mockFetch.mock.mockImplementation(async (url, options = {}) => {
    return {
      ok: false,
      status: 500,
      text: async () => "Internal Server Error",
    };
  });

  const { createGoogleDriveStorage } = await import(
    "../src/web/storage/googleDrive.js"
  );

  const defaultTemplate = () => ({ id: "default" });

  const storage = createGoogleDriveStorage({
    clientId: "test_client_id",
    defaultTemplate,
  });

  await storage.init();
  await storage.signIn();

  await assert.rejects(
    async () => await storage.listGames(),
    /Internal Server Error/,
    "Should throw error on failed fetch"
  );
});
