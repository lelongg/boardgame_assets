import assert from "node:assert/strict";
import { test, describe, before, after } from "node:test";
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const PORT = 5199;
const BASE = `http://localhost:${PORT}`;
const GAME_ID = `__font-test-${Date.now()}`;
const DATA_ROOT = path.resolve("games");
const GAME_DIR = path.join(DATA_ROOT, GAME_ID);

let serverProcess;

const waitForServer = async (url, timeout = 10000) => {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    try {
      const res = await fetch(url);
      if (res.ok || res.status === 404) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error("Server did not start in time");
};

before(async () => {
  // Create game directory and game.json so the server recognizes it
  fs.mkdirSync(GAME_DIR, { recursive: true });
  fs.writeFileSync(
    path.join(GAME_DIR, "game.json"),
    JSON.stringify({
      id: GAME_ID,
      name: "Font Test Game",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })
  );

  serverProcess = spawn("node", ["--import", "tsx", "src/server.ts", String(PORT)], {
    cwd: path.resolve("."),
    stdio: "pipe",
  });

  serverProcess.stderr.on("data", (d) => {
    // Uncomment for debugging: console.error(d.toString());
  });

  await waitForServer(`${BASE}/api/games`);
});

after(() => {
  if (serverProcess) {
    serverProcess.kill("SIGTERM");
  }
  // Clean up test game directory
  fs.rmSync(GAME_DIR, { recursive: true, force: true });
});

let downloadedFontFile;

describe("Font endpoints", () => {
  test("POST /api/games/:id/fonts/google downloads a Google Font", async () => {
    const res = await fetch(`${BASE}/api/games/${GAME_ID}/fonts/google`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Fraunces" }),
    });
    assert.equal(res.status, 200, "Should return 200");
    const body = await res.json();
    assert.ok(body.file, "Response should have a file property");
    assert.ok(body.file.endsWith(".woff2"), "File should be .woff2");
    assert.equal(body.name, "Fraunces", "Name should match");

    // Verify file exists on disk
    const fontPath = path.join(GAME_DIR, "fonts", body.file);
    assert.ok(fs.existsSync(fontPath), "Font file should exist on disk");

    downloadedFontFile = body.file;
  });

  test("POST /api/games/:id/fonts/google returns 400 for unknown font", async () => {
    const res = await fetch(`${BASE}/api/games/${GAME_ID}/fonts/google`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "ThisFontDoesNotExist99999" }),
    });
    assert.equal(res.status, 400, "Should return 400 for unknown font");
  });

  test("GET /api/games/:id/fonts/:file serves the font file", async () => {
    assert.ok(downloadedFontFile, "Should have a downloaded font file from previous test");
    const res = await fetch(`${BASE}/api/games/${GAME_ID}/fonts/${downloadedFontFile}`);
    assert.equal(res.status, 200, "Should return 200");
    assert.equal(
      res.headers.get("content-type"),
      "font/woff2",
      "Content-Type should be font/woff2"
    );
    const buf = await res.arrayBuffer();
    assert.ok(buf.byteLength > 0, "Font data should not be empty");
  });

  test("POST /api/games/:id/fonts/upload accepts a font upload", async () => {
    // Create a small fake font buffer
    const fakeFont = Buffer.alloc(64, 0x42);
    const res = await fetch(`${BASE}/api/games/${GAME_ID}/fonts/upload`, {
      method: "POST",
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Disposition": 'attachment; filename="test-font.ttf"',
      },
      body: fakeFont,
    });
    assert.equal(res.status, 200, "Should return 200");
    const body = await res.json();
    assert.ok(body.file, "Response should have a file property");
    assert.ok(body.file.endsWith(".ttf"), "File should have .ttf extension");
    assert.equal(body.name, "test-font.ttf", "Name should match filename");

    // Verify file exists
    const fontPath = path.join(GAME_DIR, "fonts", body.file);
    assert.ok(fs.existsSync(fontPath), "Uploaded font file should exist on disk");
  });

  test("DELETE /api/games/:id/fonts/:file removes the font file", async () => {
    assert.ok(downloadedFontFile, "Should have a downloaded font file from previous test");
    const fontPath = path.join(GAME_DIR, "fonts", downloadedFontFile);
    assert.ok(fs.existsSync(fontPath), "Font file should exist before delete");

    const res = await fetch(`${BASE}/api/games/${GAME_ID}/fonts/${downloadedFontFile}`, {
      method: "DELETE",
    });
    assert.equal(res.status, 204, "Should return 204");
    assert.ok(!fs.existsSync(fontPath), "Font file should be removed from disk");
  });

  test("GET /api/games/:id/fonts/:file returns 404 for deleted font", async () => {
    const res = await fetch(`${BASE}/api/games/${GAME_ID}/fonts/${downloadedFontFile}`);
    assert.equal(res.status, 404, "Should return 404 for deleted font");
  });
});
